import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { downloadBridgeFile } from "@/lib/scanner/bridge-client";
import { getInternalScanJob } from "@/lib/scanner/service";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { jobId } = await params;
  const job = await getInternalScanJob(jobId, user.id, user.role === "Administrator");
  if (!job) return NextResponse.json({ error: "Scan job not found" }, { status: 404 });
  if (job.status !== "completed" || !job.result) return NextResponse.json({ error: "Scanned file is not ready" }, { status: 409 });

  if (job.result.documentId) return NextResponse.redirect(new URL(`/api/documents/${job.result.documentId}/file`, requestOrigin(request)));
  if (!job.sourceFileUrl) return NextResponse.json({ error: "Scanner bridge did not provide a file URL" }, { status: 502 });

  try {
    const source = await downloadBridgeFile(job.sourceFileUrl);
    return new Response(source.body, {
      headers: {
        "Content-Type": job.result.mimeType,
        "Content-Disposition": `attachment; filename="${job.result.fileName.replace(/["\r\n]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to download scanned file" }, { status: 502 });
  }
}
