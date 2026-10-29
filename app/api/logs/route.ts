import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/audit-log";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

async function getRequestUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  return NextResponse.json({ logs: getAuditLogs() }, { headers: { "Cache-Control": "no-store" } });
}


