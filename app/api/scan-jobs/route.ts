import { readJsonObject } from "@/lib/request-body";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { createScanJob, getUserScanJobs, parseScanSettings } from "@/lib/scanner/service";

async function requestUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function GET() {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const jobs = await getUserScanJobs(user.id);
  return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  try {
    const input = await readJsonObject(request) as { scannerId?: unknown; settings?: unknown };
    if (typeof input.scannerId !== "string" || !input.scannerId) {
      return NextResponse.json({ error: "Choose a scanner" }, { status: 400 });
    }
    const settings = parseScanSettings(input.settings);
    const job = await createScanJob(user.id, input.scannerId, settings);
    appendAuditLog(user, "scan", `Started scan job ${job.id.slice(0, 8)} on ${job.scannerName}`, request);
    return NextResponse.json({ job }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start scan" }, { status: 400 });
  }
}
