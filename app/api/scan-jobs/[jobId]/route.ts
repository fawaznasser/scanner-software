import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { cancelUserScanJob, getUserScanJob } from "@/lib/scanner/service";

async function requestUser() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await params;
  const job = await getUserScanJob(jobId, user.id, user.role === "Administrator");
  if (!job) return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await params;
  try {
    const job = await cancelUserScanJob(jobId, user.id, user.role === "Administrator");
    if (!job) return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to cancel scan" }, { status: 503 });
  }
}
