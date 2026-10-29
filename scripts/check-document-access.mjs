import { readFileSync, unlinkSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

const base = process.env.DMS_TEST_BASE_URL || "http://localhost:3000";
const credentials = [...readFileSync("credentials.local.txt", "utf8").matchAll(/Email: ([^\r\n]+)\r?\nPassword: ([^\r\n]+)/g)];
const created = [];
const prefix = `access-check-${randomUUID()}`;
const testUserAgent = `DMS-Access-Check/${prefix}`;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF");
const sessions = [];
function sessionKey(session) {
  const token = decodeURIComponent(session.cookie.slice(session.cookie.indexOf("=") + 1));
  return createHash("sha256").update(token).digest("hex");
}
async function request(url, session, options = {}) {
  return fetch(base + url, { ...options, headers: { cookie: session.cookie, "User-Agent": testUserAgent, ...options.headers } });
}
async function listing(session) {
  const response = await request("/api/documents", session);
  assert.equal(response.status, 200);
  return (await response.json()).documents;
}
async function upload(session, visibility, category, bytes = pdf) {
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: "application/pdf" }), `${prefix}-${visibility}.pdf`);
  body.set("visibility", visibility);
  if (category !== undefined) body.set("category", category);
  body.set("ownerId", "mahdi-maatouk"); // Must never override authenticated ownership.
  const response = await request("/api/documents", session, { method: "POST", body });
  assert.equal(response.status, 201, await response.clone().text());
  const document = (await response.json()).document;
  created.push(document.id);
  assert.equal(document.ownerId, session.user.id);
  assert.equal(document.category, category ?? "Uncategorized");
  return document;
}
async function move(session, id, visibility) {
  return request(`/api/documents/${id}`, session, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility }) });
}
async function documentLogs(session, id) {
  const response = await request("/api/logs", session);
  assert.equal(response.status, 200);
  return (await response.json()).logs.filter((entry) => entry.file?.documentId === id && entry.action !== 'ocr');
}
try {
  assert.equal(credentials.length, 4);
  for (const [, email, password] of credentials) {
    const response = await fetch(base + "/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": testUserAgent }, body: JSON.stringify({ email, password }) });
    assert.equal(response.status, 200);
    sessions.push({ user: (await response.json()).user, cookie: response.headers.get("set-cookie").split(";")[0] });
  }
  const [aline, rabab, chadi, mahdi] = sessions;
  const presenceDatabase = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
  for (const session of sessions) assert(!presenceDatabase.prepare("SELECT session_key FROM browser_presence WHERE session_key = ?").get(sessionKey(session)), "Signing in alone must not mark a browser online");
  presenceDatabase.close();
  const privateDocument = await upload(aline, "private");
  const largeBytes = Buffer.concat([pdf, Buffer.alloc(12 * 1024 * 1024, 32)]);
  const largeDocument = await upload(aline, "private", "Reports", largeBytes);
  const largeDownload = await request(largeDocument.downloadUrl, aline);
  assert.equal(largeDownload.status, 200);
  assert.deepEqual(Buffer.from(await largeDownload.arrayBuffer()), largeBytes, 'Uploads over the old 10 MB proxy limit must round-trip intact');
  const oversized = new FormData();
  oversized.set('file', new Blob([Buffer.alloc(25 * 1024 * 1024 + 1)], {type:'application/pdf'}), `${prefix}-too-large.pdf`);
  const tooLarge = await request('/api/documents', aline, {method:'POST',body:oversized});
  assert([400,413].includes(tooLarge.status), 'Reject files over 25 MB');
  const invalidType = new FormData();
  invalidType.set('file', new Blob(['not a supported document']), `${prefix}-invalid.txt`);
  assert.equal((await request('/api/documents',aline,{method:'POST',body:invalidType})).status,400);
  const publicDocument = await upload(rabab, "public", "Government");
  assert.equal((await listing(rabab)).find((document) => document.id === publicDocument.id).category, "Government");
  const invalidUpload = new FormData();
  invalidUpload.set("file", new Blob([pdf], { type: "application/pdf" }), `${prefix}-invalid-category.pdf`);
  invalidUpload.set("category", "Invalid category");
  assert.equal((await request("/api/documents", aline, { method: "POST", body: invalidUpload })).status, 400);
  assert(!(await listing(aline)).some((document) => document.name === `${prefix}-invalid-category.pdf`));
  assert((await listing(aline)).some((document) => document.id === privateDocument.id));
  assert(!(await listing(rabab)).some((document) => document.id === privateDocument.id));
  assert.equal((await request(privateDocument.downloadUrl, rabab)).status, 404);
  assert.equal((await request(`/api/documents/${privateDocument.id}/history`, rabab)).status, 404);
  const ownerHistory = await request(`/api/documents/${privateDocument.id}/history`, aline);
  assert.equal(ownerHistory.status, 200);
  const ownerEvents = (await ownerHistory.json()).events;
  assert(ownerEvents.some(event => event.description.includes(privateDocument.documentNumber)));
  assert(ownerEvents.every(event => !('ipAddress' in event) && !('userAgent' in event)), 'Document history must not expose security-log fields');
  assert.equal((await move(rabab, privateDocument.id, "public")).status, 404);
  for (const session of sessions) {
    assert((await listing(session)).some((document) => document.id === publicDocument.id));
    const file = await request(publicDocument.downloadUrl, session);
    assert.equal(file.status, 200);
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);
  }
  for (const admin of [chadi, mahdi]) {
    assert((await listing(admin)).some((document) => document.id === privateDocument.id));
    assert.equal((await request(privateDocument.downloadUrl, admin)).status, 200);
  }
  assert.equal((await move(aline, publicDocument.id, "private")).status, 404);
  assert.equal((await move(rabab, publicDocument.id, "private")).status, 200);
  assert.equal((await request(publicDocument.downloadUrl, aline)).status, 404);
  assert.equal((await move(chadi, publicDocument.id, "public")).status, 200);
  assert.equal((await request(publicDocument.downloadUrl, aline)).status, 200);
  assert.equal((await fetch(base + privateDocument.downloadUrl)).status, 401);
  assert.equal((await request("/api/logs", aline)).status, 403);
  const uploadLogs = await documentLogs(chadi, privateDocument.id);
  assert.equal(uploadLogs.length, 1, "Unauthorized edits must not add successful file events");
  assert.equal(uploadLogs[0].action, "file-uploaded");
  assert.equal(uploadLogs[0].userId, aline.user.id);
  assert.equal(uploadLogs[0].file.documentName, privateDocument.name);
  const sharingLogs = await documentLogs(chadi, publicDocument.id);
  assert(sharingLogs.some((entry) => entry.action === "file-uploaded" && entry.description.includes("Category: Government") && entry.file.changes.some((change) => change.field === "category" && change.after === "Government")));
  assert.equal(sharingLogs.length, 3);
  assert(sharingLogs.some((entry) => entry.userId === rabab.user.id && entry.file.changes.some((change) => change.before === "public" && change.after === "private")));
  assert(sharingLogs.some((entry) => entry.userId === chadi.user.id && entry.file.changes.some((change) => change.before === "private" && change.after === "public")));
  assert.equal((await move(chadi, publicDocument.id, "public")).status, 200);
  assert.equal((await documentLogs(chadi, publicDocument.id)).length, 3, "No-op changes must not add events");
  const categoryResponse = await request(`/api/documents/${privateDocument.id}`, aline, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "Reports" }) });
  assert.equal(categoryResponse.status, 200);
  const trashResponse = await request(`/api/documents/${privateDocument.id}`, chadi, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleted: true }) });
  assert.equal(trashResponse.status, 200);
  const changes = await documentLogs(mahdi, privateDocument.id);
  assert(changes.some((entry) => entry.action === "file-updated" && entry.userId === aline.user.id && entry.file.changes.some((change) => change.before === "Uncategorized" && change.after === "Reports")));
  assert(changes.some((entry) => entry.action === "file-deleted" && entry.userId === chadi.user.id && entry.file.changes.some((change) => change.before === "Reports" && change.after === "Trash")));
  const database = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
  assert(database.prepare("SELECT id FROM documents WHERE id = ?").get(privateDocument.id), "Saved document must be readable from another database connection");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE document_id = ? AND json_extract(record, '$.action') != 'ocr'").get(privateDocument.id).total, 3, "File mutation audit events must persist separately from OCR events");
  database.close();
  const usersResponse = await request("/api/users", chadi);
  assert.equal(usersResponse.status, 200);
  const users = (await usersResponse.json()).users;
  const countsDatabase = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
  for (const user of users) {
    const count = countsDatabase.prepare("SELECT COUNT(*) AS total FROM documents WHERE owner_id = ? AND json_extract(record, '$.category') != 'Trash'").get(user.id).total;
    assert.equal(user.documentCount, count, "Saved-document count must match stored files");
    assert.equal(user.documentCount, user.privateDocumentCount + user.publicDocumentCount);
  }
  countsDatabase.close();
  const heartbeat = await request("/api/presence", aline, { method: "POST" });
  assert.equal(heartbeat.status, 200);
  const onlineUsers = await (await request("/api/users", chadi)).json();
  assert.equal(onlineUsers.users.find((user) => user.id === aline.user.id).status, "Online");
  const [, email, password] = credentials[0];
  const secondLogin = await fetch(base + "/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": testUserAgent }, body: JSON.stringify({ email, password }) });
  assert.equal(secondLogin.status, 200);
  const second = { user: (await secondLogin.json()).user, cookie: secondLogin.headers.get("set-cookie").split(";")[0] };
  sessions.push(second);
  assert.notEqual(sessionKey(aline), sessionKey(second));
  assert.equal((await request("/api/presence", second, { method: "POST" })).status, 200);
  assert.equal((await request("/api/auth/sign-out", aline, { method: "POST" })).status, 200);
  assert.equal((await request("/api/documents", aline)).status, 401, 'Signed-out tokens must be revoked');
  const presenceCheck = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
  assert(!presenceCheck.prepare("SELECT session_key FROM browser_presence WHERE session_key = ?").get(sessionKey(aline)));
  assert(presenceCheck.prepare("SELECT session_key FROM browser_presence WHERE session_key = ?").get(sessionKey(second)), "Signing out of one device must keep the other device online");
  presenceCheck.prepare("UPDATE browser_presence SET seen_at = ? WHERE session_key = ?").run(Date.now() - 46000, sessionKey(second));
  const stillFresh = presenceCheck.prepare("SELECT COUNT(*) AS total FROM browser_presence WHERE user_id = ? AND seen_at >= ? AND expires_at > ?").get(aline.user.id, Date.now() - 45000, Date.now()).total;
  const afterIdle = await (await request("/api/users", chadi)).json();
  assert.equal(afterIdle.users.find((user) => user.id === aline.user.id).status, stillFresh ? "Online" : "Offline", "Stale heartbeats must not count as online");
  presenceCheck.close();
  assert.equal((await request("/api/auth/sign-out", second, { method: "POST" })).status, 200);
  console.log("PASS: login alone does not create presence, heartbeat reports Online, stale heartbeats expire, sessions are unique, sign-out affects only one device, saved-document counts match SQLite.");
  console.log("PASS: owner-only private access, shared public access, both administrators, protected downloads, ownership spoof prevention, owner/admin-only moves, immediate access revocation, unauthenticated denial, SQLite persistence.");
  console.log("PASS: persistent upload/change/trash audit events, before/after values, correct editor/admin attribution, no events for denied/no-op changes, administrator-only log access.");
  console.log("PASS: upload categories persist to the library and audit logs, omitted category defaults to Uncategorized, invalid categories are rejected.");
} finally {
  if (sessions.length || created.length) {
    const database = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
    for (const id of created) {
      const row = database.prepare("SELECT file_key, record FROM documents WHERE id = ?").get(id);
      if (!row || !JSON.parse(row.record).name.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(row.file_key)) throw new Error("Refusing to clean an unexpected test document");
      database.prepare("DELETE FROM documents WHERE id = ?").run(id);
      database.prepare("DELETE FROM ocr_jobs WHERE document_id = ?").run(id);
      database.prepare("DELETE FROM ocr_pages WHERE document_id = ?").run(id);
      database.prepare("DELETE FROM audit_logs WHERE document_id = ?").run(id);
      unlinkSync(path.join(process.cwd(), ".data", "documents", row.file_key));
    }
    database.prepare("DELETE FROM audit_logs WHERE json_extract(record, '$.userAgent') = ?").run(testUserAgent);
    for (const session of sessions) {
      database.prepare("DELETE FROM browser_presence WHERE session_key = ?").run(sessionKey(session));
      const token = decodeURIComponent(session.cookie.slice(session.cookie.indexOf("=") + 1));
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
      database.prepare("DELETE FROM revoked_sessions WHERE session_id = ?").run(payload.sessionId);
    }
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE json_extract(record, '$.userAgent') = ?").get(testUserAgent).total, 0);
    database.close();
    console.log("Removed this check's temporary documents, files, file events, and marked test sign-ins; other activity was preserved.");
  }
}
