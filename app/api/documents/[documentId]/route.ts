import { readJsonObject } from "@/lib/request-body";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { updateDocument } from "@/lib/documents-store";
import { parseDocumentCategory } from "@/data/categories";
export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  try {
    const patch = await readJsonObject(request);
    const visibility = patch.visibility === "private" || patch.visibility === "public" ? patch.visibility : undefined;
    if (patch.visibility !== undefined && visibility === undefined) throw new Error("Invalid document space");
    const category = patch.category === undefined ? undefined : parseDocumentCategory(patch.category);
    const { documentId } = await params;
    const document = updateDocument(user, Number(documentId), { visibility, category, deleted: patch.deleted === true }, request);
    if (!document) return NextResponse.json({ error: "Document not found or you cannot change it." }, { status: 404 });
    return NextResponse.json({ document });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update document" }, { status: 400 }); }
}
