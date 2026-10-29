import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/database";
import { getSessionVersion } from "@/lib/account-store";

function sessionKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Only the authenticated browser heartbeat endpoint calls this function.
export function touchUserPresence(userId: string, token: string) {
  const seenAt = Date.now();
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as { expiresAt: number };
  db().prepare(`INSERT INTO browser_presence(session_key, user_id, seen_at, expires_at, session_version)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(session_key) DO UPDATE SET seen_at = excluded.seen_at`)
    .run(sessionKey(token), userId, seenAt, payload.expiresAt * 1000, getSessionVersion(userId));
  return seenAt;
}

export function clearUserPresence(token: string) {
  db().prepare("DELETE FROM browser_presence WHERE session_key = ?").run(sessionKey(token));
}

export function getUserPresence(userId: string) {
  const now = Date.now();
  const row = db().prepare(`SELECT MAX(seen_at) AS last_seen,
    MAX(CASE WHEN seen_at >= ? AND expires_at > ? AND session_version = ? THEN 1 ELSE 0 END) AS online
    FROM browser_presence WHERE user_id = ?`)
    .get(now - 45000, now, getSessionVersion(userId), userId) as { last_seen: number | null; online: number | null };
  return { lastSeenAt: row.last_seen, online: row.online === 1 };
}

