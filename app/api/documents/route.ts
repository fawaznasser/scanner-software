import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { listDocuments, saveDocument } from "@/lib/documents-store";
import { parseDocumentCategory } from "@/data/categories";

export const runtime = "nodejs";
async function requestUser() { return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value); }

export async function GET() {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const documents = listDocuments(user);
  return NextResponse.json({ total: documents.length, documents }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 26 * 1024 * 1024) return NextResponse.json({ error: "Maximum file size is 25 MB." }, { status: 413 });
  try {
    // Enforce the multipart request limit even for chunked requests without a
    // Content-Length header, before formData buffers the entire upload.
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose a document to upload.");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 26 * 1024 * 1024) {
          await reader.cancel();
          return NextResponse.json({ error: "Maximum file size is 25 MB." }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) }).formData();
    const file = form.get("file");
    const visibility = form.get("visibility") ?? "private";
    const category = parseDocumentCategory(form.get("category"));
    if (!(file instanceof File) || !["private", "public"].includes(String(visibility))) throw new Error("Choose a file and a valid document space.");
    if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Choose a file between 1 byte and 25 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : "";
    if (!mimeType) throw new Error("Only PDF, JPEG, and PNG documents are supported.");
    const document = saveDocument({ ownerId: user.id, visibility: visibility as "private" | "public", name: file.name, mimeType, bytes, category, audit: { user, request } });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save document." }, { status: 400 }); }
}
