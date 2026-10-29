import "server-only";

import { randomUUID } from "node:crypto";
import type { AuditAction, AuditLog, FileAuditDetails } from "@/data/audit-logs";
import type { DmsUser } from "@/data/users";
import { db } from "@/lib/database";

declare global {
  var __dmsAuditLogs: AuditLog[] | undefined;
}

// Carry forward genuine events from the former memory store once during migration.
function migrateMemoryEvents() {
  const previous = globalThis.__dmsAuditLogs;
  if (!previous) return;
  const insert = db().prepare("INSERT OR IGNORE INTO audit_logs(id, timestamp, user_id, document_id, record) VALUES (?, ?, ?, ?, ?)");
  for (const entry of previous) {
    if (!entry.id.startsWith("seed-")) insert.run(entry.id, entry.timestamp, entry.userId, entry.file?.documentId ?? null, JSON.stringify(entry));
  }
  globalThis.__dmsAuditLogs = undefined;
}

function getDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  if (userAgent === "DMS scanner bridge") return "Scanner bridge";
  if (userAgent.startsWith("DMS-Access-Check/")) return "Automated access check";
  if (/^(node|undici)$/i.test(userAgent)) return "Automated client (Node.js)";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  const platform = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Android") ? "Android" : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : userAgent.includes("Mac") ? "macOS" : userAgent.includes("Linux") ? "Linux" : "";
  return browser === "Browser" ? "Unrecognized client" : `${browser}${platform ? ` on ${platform}` : ""}`;
}

export function appendAuditLog(user: DmsUser, action: AuditAction, description: string, request: Request, file?: FileAuditDetails) {
  migrateMemoryEvents();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const entry: AuditLog = {
    id: randomUUID(),
    ...(file ? { file } : {}),
    userId: user.id,
    userName: user.name,
    userInitials: user.initials,
    role: user.role,
    action,
    description,
    timestamp: new Date().toISOString(),
    ipAddress: forwardedFor || request.headers.get("x-real-ip") || "Local network",
    device: getDevice(request.headers.get("user-agent")),
    userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? "",
  };

  db().prepare("INSERT INTO audit_logs(id, timestamp, user_id, document_id, record) VALUES (?, ?, ?, ?, ?)").run(entry.id, entry.timestamp, entry.userId, file?.documentId ?? null, JSON.stringify(entry));
  return entry;
}

export function getAuditLogs() {
  migrateMemoryEvents();
  return (db().prepare("SELECT record FROM audit_logs ORDER BY timestamp DESC, rowid DESC").all() as { record: string }[]).map((row) => JSON.parse(row.record) as AuditLog);
}

