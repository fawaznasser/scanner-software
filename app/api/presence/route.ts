import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { touchUserPresence } from "@/lib/presence-store";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const user = verifySessionToken(token);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const seenAt = touchUserPresence(user.id, token!);
  return NextResponse.json({ seenAt: new Date(seenAt).toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
