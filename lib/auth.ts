import "server-only";

import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSessionVersion, verifyPassword } from "@/lib/account-store";
import type { DmsUser } from "@/data/users";
import { getDmsUserById } from "@/lib/user-store";
import { db } from "@/lib/database";

export const SESSION_COOKIE = "dms_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
function authSecret() {
  const secret = process.env.AUTH_SECRET || readFileSync(path.join(process.cwd(), ".data", "session-secret"), "utf8").trim();
  if (secret.length < 32 || secret === "replace-with-a-long-random-secret") throw new Error("Configure a strong authentication secret.");
  return secret;
}

type SessionPayload = {
  userId: string;
  expiresAt: number;
  sessionVersion: number;
  sessionId?: string;
};

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

export function authenticateUser(email: string, password: string): DmsUser | null {
  if (password.length > 128) return null;
  return verifyPassword(email, password);
}

export function createSessionToken(user: DmsUser) {
  const payload: SessionPayload = {
    userId: user.id,
    sessionId: randomUUID(),
    sessionVersion: getSessionVersion(user.id),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySessionToken(token?: string): DmsUser | null {
  if (!token) return null;

  try {
    const [encodedPayload, providedSignature] = token.split(".");
    if (!encodedPayload || !providedSignature) return null;

    const expectedSignature = sign(encodedPayload);
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.sessionId || db().prepare("SELECT session_id FROM revoked_sessions WHERE session_id = ? AND expires_at > ?").get(payload.sessionId, Math.floor(Date.now() / 1000))) return null;
    if (payload.sessionVersion !== getSessionVersion(payload.userId)) return null;
    return getDmsUserById(payload.userId);
  } catch {
    return null;
  }
}

export function revokeSessionToken(token: string) {
  if (!verifySessionToken(token)) return;
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as SessionPayload;
  db().prepare("DELETE FROM revoked_sessions WHERE expires_at <= ?").run(Math.floor(Date.now() / 1000));
  db().prepare("INSERT OR REPLACE INTO revoked_sessions(session_id, expires_at) VALUES (?, ?)").run(payload.sessionId!, payload.expiresAt);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_LIFETIME_SECONDS,
};

