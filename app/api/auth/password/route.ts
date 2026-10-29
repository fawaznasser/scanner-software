import { readJsonObject } from "@/lib/request-body";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { changeUserPassword } from "@/lib/account-store";

export async function POST(request: Request) {
  const store = await cookies();
  const user = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in to change your password." }, { status: 401 });
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await readJsonObject(request);
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" || body.currentPassword.length > 128) {
      return NextResponse.json({ error: "Enter your current and new passwords." }, { status: 400 });
    }
    const updated = changeUserPassword(user.id, body.currentPassword, body.newPassword);
    store.set(SESSION_COOKIE, createSessionToken(updated), sessionCookieOptions);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to change password." }, { status: 400 });
  }
}
