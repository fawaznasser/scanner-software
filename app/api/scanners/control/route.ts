import { readJsonObject } from "@/lib/request-body";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getScannerDriverStatus, reconnectBridge } from "@/lib/scanner/bridge-client";
import { appendAuditLog } from "@/lib/audit-log";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export async function GET() {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in to view driver status." }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  try { return NextResponse.json(await getScannerDriverStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check driver status" }, { status: 503 }); }
}
export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in to connect a scanner." }, { status: 401 });
  if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  try {
    const body = await readJsonObject(request);
    if (body.action !== undefined && body.action !== "reconnect" && body.action !== "repair-driver") return NextResponse.json({ error: "Unknown scanner action" }, { status: 400 });
    const repair = body.action === "repair-driver";
    if (repair && user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
    if (repair) appendAuditLog(user, "scanner-control", "Requested a Windows scanning-service restart from DMS", request);
    const result = await reconnectBridge(repair);
    appendAuditLog(user, "scanner-control", `${repair ? "Restarted the Windows scanning service" : "Checked the scanner connection"}; ${result.scanners.length} device(s) reported`, request);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reconnect scanner" }, { status: error instanceof SyntaxError || error instanceof RangeError ? 400 : 503 });
  }
}
