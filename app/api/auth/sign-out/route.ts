import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { SESSION_COOKIE, verifySessionToken, revokeSessionToken } from "@/lib/auth";
import { clearUserPresence } from "@/lib/presence-store";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = verifySessionToken(token);
  if (user) {
    appendAuditLog(user, "sign-out", "Signed out of DMS", request);
    clearUserPresence(token!);
    revokeSessionToken(token!);
  }
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

