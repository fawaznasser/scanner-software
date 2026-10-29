import "server-only";
import { db, transaction } from "@/lib/database";
import { getDocument } from "@/lib/documents-store";
import { ensureOcrWorker } from "@/lib/ocr-worker-control";
import { appendAuditLog } from "@/lib/audit-log";
import type { DmsUser } from "@/data/users";
export function queueDocumentOcr(id: number, user: DmsUser, request: Request) {
  const document = getDocument(user, id);
  if (!document || document.category === "Trash") return null;
  if (user.role !== "Administrator" && document.ownerId !== user.id) throw new Error("Only the document owner or an administrator can run text recognition.");
  transaction(() => {
    const job = db().prepare("SELECT state, lease_until FROM ocr_jobs WHERE document_id=?").get(id) as { state: string; lease_until: number } | undefined;
    if (job?.state === "queued" || (job?.state === "processing" && job.lease_until > Date.now())) return;
    const row = db().prepare("SELECT record FROM documents WHERE id=?").get(id) as { record: string };
    const record = { ...JSON.parse(row.record), status: "Processing", ocrStatus: "queued", ocrProgress: 0, ocrError: undefined };
    db().prepare("UPDATE documents SET record=? WHERE id=?").run(JSON.stringify(record), id);
    db().prepare("INSERT INTO ocr_jobs(document_id,state,queued_at) VALUES(?,'queued',?) ON CONFLICT(document_id) DO UPDATE SET state='queued',attempts=0,queued_at=excluded.queued_at,started_at=NULL,finished_at=NULL,error=NULL,token=NULL,lease_until=0").run(id, new Date().toISOString());
    appendAuditLog(user, "ocr", `Queued local text recognition for ${document.documentNumber} (${document.name})`, request, { documentId: id, documentName: document.name, documentNumber: document.documentNumber, ownerId: document.ownerId });
  });
  ensureOcrWorker(true);
  return getDocument(user, id);
}
