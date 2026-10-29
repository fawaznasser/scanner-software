import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

let database: DatabaseSync | undefined;
export function db() {
  if (!database) {
    mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
    database = new DatabaseSync(path.join(process.cwd(), ".data", "dms.sqlite"));
    database.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK(visibility IN ('private','public')),
        scan_job_id TEXT UNIQUE,
        file_key TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS documents_access ON documents(owner_id, visibility);
      CREATE TABLE IF NOT EXISTS scan_jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        document_id INTEGER,
        record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_logs_time ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS audit_logs_document ON audit_logs(document_id);
      CREATE TABLE IF NOT EXISTS browser_presence (
        session_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        session_version INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS browser_presence_user ON browser_presence(user_id);
      CREATE TABLE IF NOT EXISTS revoked_sessions (session_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ocr_jobs (
        document_id INTEGER PRIMARY KEY, state TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0, queued_at TEXT NOT NULL,
        started_at TEXT, finished_at TEXT, error TEXT, token TEXT,
        lease_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS ocr_pages (
        document_id INTEGER NOT NULL, page_number INTEGER NOT NULL,
        text TEXT NOT NULL, confidence REAL,
        PRIMARY KEY(document_id, page_number)
      );
      CREATE TABLE IF NOT EXISTS ocr_worker_lock (
        id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, lease_until INTEGER NOT NULL
      );
    `);
  }
  return database;
}

export function transaction<T>(operation: () => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}
