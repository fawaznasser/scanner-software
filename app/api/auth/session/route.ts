import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ user });
}

