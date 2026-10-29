import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getDocument } from "@/lib/documents-store";
import { getAuditLogs } from "@/lib/audit-log";
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = Number((await params).documentId);
  if (!getDocument(user, id)) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const events = getAuditLogs().filter(event => event.file?.documentId === id).map(({ id, timestamp, userName, description }) => ({ id, timestamp, userName, description }));
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}
