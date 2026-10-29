import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { scannerConfig } from "@/lib/scanner/config";
import { listScanners } from "@/lib/scanner/service";

export async function GET() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const scanners = await listScanners();
    return NextResponse.json({ provider: scannerConfig.provider, scanners }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to discover scanners" }, { status: 503 });
  }
}
