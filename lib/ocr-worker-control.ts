import "server-only";
import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/database";
declare global { var __dmsOcrCheckAt: number | undefined; var __dmsOcrSpawnAt: number | undefined; }
export function ensureOcrWorker(force = false) {
  const now = Date.now();
  if (!force && now - (globalThis.__dmsOcrCheckAt ?? 0) < 3000) return;
  globalThis.__dmsOcrCheckAt = now;
  if (!db().prepare("SELECT document_id FROM ocr_jobs WHERE state='queued' OR (state='processing' AND lease_until < ?) LIMIT 1").get(now)) return;
  if (db().prepare("SELECT id FROM ocr_worker_lock WHERE id=1 AND lease_until > ?").get(now)) return;
  if (now - (globalThis.__dmsOcrSpawnAt ?? 0) < 5000) return;
  globalThis.__dmsOcrSpawnAt = now;
  const logs = path.join(process.cwd(), ".data", "run-logs");
  mkdirSync(logs, { recursive: true });
  const out = openSync(path.join(logs, "ocr.out.log"), "a");
  const err = openSync(path.join(logs, "ocr.err.log"), "a");
  try {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "ocr-worker.mjs")], { cwd: process.cwd(), detached: true, windowsHide: true, stdio: ["ignore", out, err], timeout: 20 * 60_000 });
    child.on("error", () => { globalThis.__dmsOcrCheckAt = 0; globalThis.__dmsOcrSpawnAt = 0; });
    child.unref();
  } finally { closeSync(out); closeSync(err); }
}
