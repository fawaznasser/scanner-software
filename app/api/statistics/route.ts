import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/database";
import { getDmsUsers } from "@/lib/user-store";
import { calculateScanStatistics } from "@/lib/scan-statistics";
import type { ScanJob } from "@/lib/scanner/types";
export const runtime = "nodejs";
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function GET(request: Request) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") || "", to = params.get("to") || "";
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return NextResponse.json({ error: "Choose a valid date range. The end date must be on or after the start date." }, { status: 400 });
  const rows = db().prepare("SELECT id, owner_id, record FROM scan_jobs").all() as { id: string; owner_id: string; record: string }[];
  const jobs = rows.map(row => ({ ...JSON.parse(row.record), id: row.id, userId: row.owner_id } as ScanJob));
  return NextResponse.json({ ...calculateScanStatistics(getDmsUsers(), jobs, { from, to }), filters: { from, to }, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
