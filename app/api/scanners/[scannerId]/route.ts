import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getScanner } from "@/lib/scanner/service";

export async function GET(_request: Request, { params }: { params: Promise<{ scannerId: string }> }) {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const { scannerId } = await params;
    const scanner = await getScanner(scannerId);
    if (!scanner) return NextResponse.json({ error: "Scanner not found" }, { status: 404 });
    return NextResponse.json({ scanner }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load scanner" }, { status: 503 });
  }
}
