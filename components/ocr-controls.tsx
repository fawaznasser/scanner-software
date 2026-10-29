"use client";
import { useState } from "react";
import type { DocumentData } from "@/data/documents";
import type { DmsUser } from "@/data/users";
import "@/app/ocr.css";
export default function OcrControls({ document, user }: { document: DocumentData & { ownerId?: string }; user: DmsUser | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const processing = document.ocrStatus === "queued" || document.ocrStatus === "processing";
  const canRun = Boolean(user && (user.role === "Administrator" || user.id === document.ownerId));
  const run = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/documents/${document.id}/ocr`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to start text recognition");
      window.dispatchEvent(new Event("documents-updated"));
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to queue OCR"); }
    finally { setBusy(false); }
  };
  return <div className="ocr-controls" aria-live="polite"><span>{document.ocrStatus === "queued" ? "Waiting for text recognition" : document.ocrStatus === "processing" ? `Reading text · ${document.ocrProgress ?? 0}%` : document.status === "Completed" ? document.ocrText.trim() ? "Text searchable" : "Completed — no readable text found" : document.status === "Failed" ? "Text recognition failed" : "Text not processed"}</span>
    {canRun && <button type="button" disabled={busy || processing} onClick={() => void run()}>{busy ? "Queuing…" : processing ? "Processing…" : document.status === "Failed" ? "Retry text recognition" : document.status === "Completed" ? "Read text again" : "Read text"}</button>}
    {(error || document.ocrError) && <small role="alert">{error || document.ocrError}</small>}
    {document.ocrStatus === "completed" && document.ocrText.trim() && document.ocrConfidence !== undefined && document.ocrConfidence < 60 && <small>Low-confidence recognition. Check the extracted words against the original scan.</small>}
  </div>;
}
