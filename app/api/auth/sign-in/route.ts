import { readJsonObject } from "@/lib/request-body";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticateUser, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit-log";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  let credentials: { email?: unknown; password?: unknown };
  try {
    credentials = await readJsonObject(request);
  } catch {
    return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  }

  if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (credentials.email.length > 254 || credentials.password.length > 128) {
    return NextResponse.json({ error: "The email or password is incorrect." }, { status: 401 });
  }
  const key = credentials.email.trim().toLowerCase();
  const previous = attempts.get(key);
  if (previous && previous.until > Date.now() && previous.count >= 10) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const user = authenticateUser(credentials.email, credentials.password);
  if (!user) {
    if (attempts.size > 10000) for (const [entry, value] of attempts) if (value.until <= Date.now()) attempts.delete(entry);
    attempts.set(key, { count: previous && previous.until > Date.now() ? previous.count + 1 : 1, until: previous && previous.until > Date.now() ? previous.until : Date.now() + 15 * 60_000 });
    return NextResponse.json({ error: "The email or password is incorrect." }, { status: 401 });
  }
  attempts.delete(key);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions);
  appendAuditLog(user, "sign-in", "Signed in to DMS", request);
  return NextResponse.json({ user });
}

