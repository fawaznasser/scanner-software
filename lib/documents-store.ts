import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";
import { db, transaction } from "@/lib/database";
import { appendAuditLog } from "@/lib/audit-log";
import type { DmsUser } from "@/data/users";
import type { DocumentData } from "@/data/documents";
import { getDmsUserById } from "@/lib/user-store";
import { parseDocumentCategory } from "@/data/categories";
import { ensureOcrWorker } from "@/lib/ocr-worker-control";

export type DocumentRecord = DocumentData & { ownerId: string; ownerName: string; visibility: "private" | "public"; createdAt: string };
type Row = { id: number; owner_id: string; visibility: "private" | "public"; file_key: string; mime_type: string; record: string };
const directory = path.join(process.cwd(), ".data", "documents");
export function canReadDocument(user: DmsUser, row: Pick<Row, "owner_id" | "visibility"> & Partial<Pick<Row, "record">>) {
  if (user.role === "Administrator" || row.owner_id === user.id) return true;
  return row.visibility === "public" && (!row.record || JSON.parse(row.record).category !== "Trash");
}
function serialize(row: Row): DocumentRecord {
  const record = JSON.parse(row.record);
  let sizeBytes = record.sizeBytes;
  try { sizeBytes = statSync(path.join(directory, row.file_key)).size; } catch { /* Keep recorded metadata if the file is unavailable. */ }
  return { ...record, sizeBytes, status: record.status === "Processing" && !record.ocrStatus ? "Not processed" : record.status, id: row.id, ownerId: row.owner_id, ownerName: getDmsUserById(row.owner_id)?.name ?? "Unknown user", visibility: row.visibility, downloadUrl: `/api/documents/${row.id}/file` };
}
export function listDocuments(user: DmsUser) {
  ensureOcrWorker();
  const rows = user.role === "Administrator"
    ? db().prepare("SELECT * FROM documents ORDER BY id DESC").all()
    : db().prepare("SELECT * FROM documents WHERE owner_id = ? OR (visibility = 'public' AND json_extract(record, '$.category') != 'Trash') ORDER BY id DESC").all(user.id);
  return (rows as unknown as Row[]).map(serialize);
}
function rowById(id: number) { return db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined; }
export function getDocument(user: DmsUser, id: number) {
  const row = rowById(id);
  return row && canReadDocument(user, row) ? serialize(row) : null;
}
export function readDocumentFile(user: DmsUser, id: number) {
  const row = rowById(id);
  if (!row || !canReadDocument(user, row)) return null;
  return { document: serialize(row), bytes: readFileSync(path.join(directory, row.file_key)), mimeType: row.mime_type };
}
export function saveDocument(input: { ownerId: string; visibility: "private" | "public"; name: string; mimeType: string; bytes: Uint8Array; pages?: number; category?: string; scanJobId?: string; audit?: { user: DmsUser; request: Request } }) {
  if (input.scanJobId) {
    const existing = db().prepare("SELECT * FROM documents WHERE scan_job_id = ?").get(input.scanJobId) as Row | undefined;
    if (existing) return serialize(existing);
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = randomUUID();
  const name = input.name.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "Document.pdf";
  const createdAt = new Date().toISOString();
  const record = { name, category: parseDocumentCategory(input.category), createdAt, date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Beirut" }).format(new Date()), pages: input.pages ?? 1, size: `${(input.bytes.length / (1024 * 1024)).toFixed(2)} MB`, sizeBytes: input.bytes.length, status: "Not processed", type: input.mimeType.startsWith("image/") ? "jpg" : "pdf", tags: [], ocrText: "Text recognition has not been run for this document." };
  writeFileSync(path.join(directory, key), input.bytes, { flag: "wx", mode: 0o600 });
  try {
    return transaction(() => {
    const inserted = db().prepare("INSERT INTO documents(owner_id, visibility, scan_job_id, file_key, mime_type, record) VALUES (?, ?, ?, ?, ?, ?)").run(input.ownerId, input.visibility, input.scanJobId ?? null, key, input.mimeType, JSON.stringify(record));
    const id = Number(inserted.lastInsertRowid);
    db().prepare("INSERT INTO ocr_jobs(document_id,state,queued_at) VALUES(?,'queued',?)").run(id, createdAt);
    db().prepare("UPDATE documents SET record = ? WHERE id = ?").run(JSON.stringify({ ...record, documentNumber: `DOC-${new Date().getFullYear()}-${String(id).padStart(6, "0")}` }), id);
    const storedRow = rowById(id)!;
    const queued = { ...JSON.parse(storedRow.record), status: "Processing", ocrStatus: "queued", ocrProgress: 0, ocrText: "" };
    db().prepare("UPDATE documents SET record=? WHERE id=?").run(JSON.stringify(queued), id);
    const document = serialize(rowById(id)!);
    const actor = input.audit?.user ?? getDmsUserById(input.ownerId);
    if (!actor) throw new Error("Document owner not found");
    appendAuditLog(actor, input.scanJobId ? "file-scanned" : "file-uploaded", `${input.scanJobId ? "Saved scanned file" : "Uploaded"} ${document.documentNumber} (${document.name}) to ${input.visibility === "private" ? "Private" : "Public"}. Category: ${document.category}`, input.audit?.request ?? new Request("http://scanner-bridge.local", { headers: { "user-agent": "DMS scanner bridge" } }), {
      documentId: id, documentNumber: document.documentNumber, documentName: document.name, ownerId: document.ownerId,
      changes: [{ field: "visibility", before: "Not saved", after: document.visibility }, { field: "category", before: "Not saved", after: document.category }],
    });
    ensureOcrWorker(true);
    return document;
    });
  } catch (error) { unlinkSync(path.join(directory, key)); throw error; }
}
export function updateDocument(user: DmsUser, id: number, patch: { visibility?: "private" | "public"; category?: string; deleted?: boolean }, request: Request) {
  return transaction(() => {
  const row = rowById(id);
  if (!row || (user.role !== "Administrator" && row.owner_id !== user.id)) return null;
  const record = JSON.parse(row.record);
  const before = serialize(row);
  if (patch.category) record.category = patch.category;
  if (patch.deleted) record.category = "Trash";
  if (patch.deleted && ["queued", "processing"].includes(record.ocrStatus)) {
    record.ocrStatus = "cancelled"; record.status = "Not processed";
    db().prepare("UPDATE ocr_jobs SET state='cancelled',token=NULL,lease_until=0 WHERE document_id=?").run(id);
  }
  const changes = [];
  if (patch.visibility && patch.visibility !== row.visibility) changes.push({ field: "visibility", before: row.visibility, after: patch.visibility });
  if (record.category !== before.category) changes.push({ field: "category", before: before.category, after: String(record.category) });
  if (!changes.length) return before;
  db().prepare("UPDATE documents SET visibility = ?, record = ? WHERE id = ?").run(patch.visibility ?? row.visibility, JSON.stringify(record), id);
  const document = serialize(rowById(id)!);
  const deleted = before.category !== "Trash" && document.category === "Trash";
  const description = changes.map((change) => `${change.field === "visibility" ? "Document space" : "Category"}: ${change.before} → ${change.after}`).join("; ");
  appendAuditLog(user, deleted ? "file-deleted" : "file-updated", `${deleted ? "Moved to trash" : "Updated"} ${document.documentNumber} (${document.name}). ${description}`, request, {
    documentId: id, documentNumber: document.documentNumber, documentName: document.name, ownerId: document.ownerId, changes,
  });
  return document;
  });
}
