"use client";
import { useEffect, useState } from "react";
import type { DocumentData } from "@/data/documents";
import type { DmsUser } from "@/data/users";
import OcrControls from "@/components/ocr-controls";
type Event = { id: string; timestamp: string; userName: string; description: string };
export default function DocumentDetailTabs({ tab, doc, user }: { tab: string; doc: DocumentData; user: DmsUser | null }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<{ page: number; text: string }[]>([]);
  useEffect(() => {
    if (tab !== "Extracted Text") return;
    const controller = new AbortController();
    setPages([]);
    void fetch(`/api/documents/${doc.id}/ocr`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (response.ok && !controller.signal.aborted) setPages(payload.pages);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [tab, doc.id, doc.ocrCompletedAt]);
  useEffect(() => {
    if (tab !== "History") return;
    const controller = new AbortController();
    setLoading(true); setEvents([]); setError("");
    void fetch(`/api/documents/${doc.id}/history`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load document history");
      if (!controller.signal.aborted) setEvents(payload.events);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [doc.id, tab]);
  return <div className="tab-content">
    {tab === "Extracted Text" && <div className="detail-card"><h3>Extracted document text</h3><OcrControls document={doc} user={user} /><p>Processed locally in English, Arabic and French. Recognition can contain mistakes; check important values against the original.</p>{pages.length ? pages.map(page => <section key={page.page}><h4>Page {page.page}</h4><pre dir="auto" className="ocr-page-text">{page.text || "No readable printed text found on this page."}</pre></section>) : <pre dir="auto" className="ocr-page-text">{doc.ocrText || "No text has been extracted yet."}</pre>}</div>}
    {tab === "Document Details" && <div className="metadata-grid"><span>Document number</span><b>{doc.documentNumber}</b><span>File name</span><b>{doc.name}</b><span>Category</span><b>{doc.category}</b><span>Added</span><b>{doc.date}</b><span>Pages recorded</span><b>{doc.pages}</b><span>Text recognition</span><b>{doc.status}</b><span>File size</span><b>{doc.size}</b></div>}
    {tab === "Pages" && <div className="detail-card"><h3>{doc.pages} recorded page(s)</h3><p>Open a page in the document viewer. For uploaded PDFs, the recorded page count may not reflect the full file.</p>{Array.from({ length: Math.min(doc.pages, 100) }, (_, index) => <p key={index}><a href={`${doc.downloadUrl}?preview=1#page=${index + 1}`} target="_blank" rel="noopener noreferrer">Open page {index + 1}</a></p>)}</div>}
    {tab === "History" && <div className="history-list">{loading && <p>Loading recorded history…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && !events.length && <p>No recorded activity for this document.</p>}{events.map(event => <p key={event.id}><strong>{event.userName}</strong> · {event.description}<span>{new Date(event.timestamp).toLocaleString("en-GB", { timeZone: "Asia/Beirut" })}</span></p>)}</div>}
  </div>;
}
