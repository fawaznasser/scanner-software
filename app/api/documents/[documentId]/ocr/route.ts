import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getDocument } from "@/lib/documents-store";
import { db } from "@/lib/database";
import { queueDocumentOcr } from "@/lib/ocr-service";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const id = Number((await params).documentId);
  const document = getDocument(user, id);
  if (!document || document.category === "Trash") return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const pages = db().prepare("SELECT page_number AS page, text, confidence FROM ocr_pages WHERE document_id=? ORDER BY page_number").all(id);
  return NextResponse.json({ document, pages }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const document = queueDocumentOcr(Number((await params).documentId), user, request);
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ document }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue OCR" }, { status: 403 }); }
}
