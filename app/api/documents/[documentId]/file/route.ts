import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { readDocumentFile } from "@/lib/documents-store";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { documentId } = await params;
  const result = readDocumentFile(user, Number(documentId));
  if (!result) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const disposition = new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment";
  return new Response(new Uint8Array(result.bytes), { headers: {
    "Content-Type": result.mimeType,
    "Content-Disposition": `${disposition}; filename="document"; filename*=UTF-8''${encodeURIComponent(result.document.name)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
