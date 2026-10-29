import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { listDocuments } from "@/lib/documents-store";
import { queueDocumentOcr } from "@/lib/ocr-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== "Administrator") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  let queued = 0;
  for (const document of listDocuments(user).filter(doc => doc.category !== "Trash" && doc.status === "Not processed").slice(0, 100)) {
    queueDocumentOcr(document.id, user, request); queued++;
  }
  return NextResponse.json({ queued }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
