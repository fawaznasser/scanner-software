import "server-only";

import type { ScanJob } from "@/lib/scanner/types";
import { db } from "@/lib/database";

export function saveScanJob(job: ScanJob) {
  db().prepare("INSERT INTO scan_jobs(id, owner_id, record) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record").run(job.id, job.userId, JSON.stringify(job));
  return job;
}

export function findScanJob(id: string) {
  const row = db().prepare("SELECT record FROM scan_jobs WHERE id = ?").get(id) as { record: string } | undefined;
  return row ? JSON.parse(row.record) as ScanJob : null;
}

export function listUserScanJobs(userId: string) {
  return (db().prepare("SELECT record FROM scan_jobs WHERE owner_id = ? ORDER BY rowid DESC LIMIT 25").all(userId) as { record: string }[]).map((row) => JSON.parse(row.record) as ScanJob);
}

export function updateScanJob(id: string, patch: Partial<ScanJob>) {
  const current = findScanJob(id);
  if (!current) return null;
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  saveScanJob(updated);
  return updated;
}
