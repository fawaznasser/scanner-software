"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, Grid2X2, List, Search, X } from "lucide-react";
import Dropdown from "@/components/dropdown";
import DocumentDate from "@/components/document-date";
import OcrControls from "@/components/ocr-controls";
import { DocumentAccess, DocumentUploadButton } from "@/components/document-spaces";
import { documentCategories } from "@/data/categories";
import type { DmsUser } from "@/data/users";
import type { DocumentRecord } from "@/lib/documents-store";
import { filterLibrary } from "@/lib/document-library";
import { documentTextSnippet } from "@/lib/document-text";
import { patchDocument } from "@/lib/use-documents";
import "@/app/document-library.css";

export default function DocumentLibrary({ docs, user, controls, notify, query, onQueryChange }: {
  docs: DocumentRecord[]; user: DmsUser | null; controls: React.ReactNode;
  notify: (message: string) => void; query: string; onQueryChange: (value: string) => void;
}) {
  const [scope, setScope] = useState("Everything");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("Newest first");
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [move, setMove] = useState("");
  const [busy, setBusy] = useState(false);
  const [queuingOcr, setQueuingOcr] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get("category"); if (value && documentCategories.some(category => category === value)) setCategory(value); }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  const invalidDates = Boolean(from && to && from > to);
  const results = useMemo(() => filterLibrary(docs, { query, scope, category, status, type, from, to, sort }), [docs, query, scope, category, status, type, from, to, sort]);
  const chosen = results.filter(doc => selected.includes(doc.id));
  const canManage = chosen.length > 0 && chosen.every(doc => user?.role === "Administrator" || doc.ownerId === user?.id);
  useEffect(() => { setSelected([]); }, [query, scope, category, status, type, from, to]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (preview) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [preview]);
  useEffect(() => {
    if (preview) setPreview(docs.find(doc => doc.id === preview.id) ?? null);
  }, [docs, preview?.id]);
  const reset = () => { onQueryChange(""); setScope("Everything"); setCategory(""); setStatus(""); setType(""); setFrom(""); setTo(""); setSort("Newest first"); };
  const processExisting = async () => {
    setQueuingOcr(true);
    try {
      const response = await fetch("/api/ocr", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to queue OCR");
      notify(`${payload.queued} documents queued for local text recognition.`);
      window.dispatchEvent(new Event("documents-updated"));
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to queue OCR"); }
    finally { setQueuingOcr(false); }
  };
  const downloadChosen = async () => {
    if (chosen.length > 20) { notify("Select up to 20 documents per download batch."); return; }
    setBusy(true);
    try {
      for (const doc of chosen) {
        const link = document.createElement("a");
        link.href = doc.downloadUrl; link.download = doc.name;
        document.body.appendChild(link); link.click(); link.remove();
        await new Promise(resolve => window.setTimeout(resolve, 200));
      }
      notify("Downloads requested. Your browser may ask you to allow multiple downloads.");
    } finally { setBusy(false); }
  };
  const updateChosen = async (deleted: boolean) => {
    if (!canManage || (!deleted && !move)) return;
    if (deleted && !window.confirm(`Move ${chosen.length} selected document(s) to trash?`)) return;
    setBusy(true);
    let updated = 0;
    try {
      for (const doc of chosen) { await patchDocument(doc.id, deleted ? { deleted: true } : { category: move }); updated++; }
      notify(deleted ? `${updated} documents moved to trash` : `${updated} documents moved to ${move}`);
      setSelected([]);
    } catch (error) { notify(`${updated} updated. ${error instanceof Error ? error.message : "Unable to finish"}`); }
    finally { setBusy(false); }
  };
  const download = (doc: DocumentRecord) => <a href={doc.downloadUrl} download={doc.name}><Download size={18} />Download</a>;
  const actions = (doc: DocumentRecord) => <div className="library-doc-actions"><button type="button" onClick={() => setPreview(doc)}><Eye size={18} />Preview</button>{download(doc)}</div>;
  return <section className="panel unified-library" aria-label="All documents">
    <div className="document-library-top">{controls}<DocumentUploadButton notify={notify} /></div>
    <div className="library-discovery">
      <label className="library-query"><Search size={21} /><input ref={input} value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search by name, document number, or stored text…" aria-label="Search all documents" /><span>Ctrl K</span></label>
      <fieldset className="library-scope"><legend>Search in</legend>{["Everything", "File names", "Recognized text", "Document details"].map(value => <button type="button" key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value}</button>)}</fieldset>
      <p className="library-ocr-note">New scans and uploads receive local text recognition in English, Arabic and French. Search their contents when processing finishes. Original files stay unchanged.</p>
      {user?.role === "Administrator" && <button type="button" disabled={queuingOcr} onClick={() => void processExisting()}>{queuingOcr ? "Queuing documents…" : "Read text in existing documents"}</button>}
      <div className="library-filter-fields">
        <label>Category<Dropdown value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{documentCategories.map(value => <option key={value}>{value}</option>)}</Dropdown></label>
        <label>Text recognition<Dropdown value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["Not processed", "Completed", "Processing", "Failed"].map(value => <option key={value}>{value}</option>)}</Dropdown></label>
        <label>File type<Dropdown value={type} onChange={e => setType(e.target.value)}><option value="">All file types</option><option value="pdf">PDF</option><option value="image">Images</option></Dropdown></label>
        <label>Added from<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
        <label>Added through<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
        <label>Sort by<Dropdown value={sort} onChange={e => setSort(e.target.value)}>{["Newest first", "Oldest first", "Most relevant", "Name"].map(value => <option key={value}>{value}</option>)}</Dropdown></label>
      </div>
      {invalidDates && <p role="alert">The end date must be on or after the start date.</p>}
      <div className="library-results-toolbar"><span role="status">{results.length} of {docs.length} documents</span><button type="button" onClick={reset}>Clear search and filters</button><div className="view-switch"><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List /></button><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 /></button></div></div>
    </div>
    {chosen.length > 0 && <div className="library-bulk-controls"><strong>{chosen.length} selected</strong><button disabled={busy} onClick={() => void downloadChosen()}>Download selected</button>{canManage && <><label>Move to category<Dropdown value={move} disabled={busy} onChange={e => setMove(e.target.value)}><option value="">Choose category</option>{documentCategories.map(value => <option key={value}>{value}</option>)}</Dropdown></label><button disabled={busy || !move} onClick={() => void updateChosen(false)}>Move selected</button><button disabled={busy} onClick={() => void updateChosen(true)}>Delete selected</button></>}<button disabled={busy} onClick={() => setSelected([])}>Clear selection</button></div>}
    {!results.length && <div className="library-no-results"><Search /><h2>No documents found</h2><p>Try another search or clear the filters. Also check the document space selected above.</p><button onClick={reset}>Clear search and filters</button></div>}
    {view === "list" && results.length > 0 ? <div className="library-table-wrap"><table className="library-table"><thead><tr><th><input type="checkbox" aria-label="Select all results" disabled={busy} checked={results.length > 0 && results.every(doc => selected.includes(doc.id))} onChange={e => setSelected(e.target.checked ? results.map(doc => doc.id) : [])} /></th><th>Document</th><th>Category</th><th>Date and time added</th><th>Pages / size</th><th>Text recognition</th><th>Actions</th></tr></thead><tbody>{results.map(doc => <tr key={doc.id}><td><input type="checkbox" aria-label={`Select ${doc.name}`} disabled={busy} checked={selected.includes(doc.id)} onChange={e => setSelected(e.target.checked ? [...selected, doc.id] : selected.filter(id => id !== doc.id))} /></td><td><button className="library-file-name" onClick={() => setPreview(doc)}>{doc.name}</button><small>{doc.documentNumber}</small><DocumentAccess document={doc} user={user} notify={notify} />{query.trim() && <p dir="auto" className="library-text-snippet">{documentTextSnippet(doc, query)}</p>}</td><td>{doc.category}</td><td><DocumentDate createdAt={doc.createdAt} fallback={doc.date} /></td><td>{doc.pages} pages<small>{doc.size}</small></td><td><OcrControls document={doc} user={user} /></td><td>{actions(doc)}</td></tr>)}</tbody></table></div> : view === "grid" && <div className="library-card-grid">{results.map(doc => <article key={doc.id}><strong>{doc.name}</strong><small>{doc.documentNumber}</small><p>{doc.category} · {doc.pages} pages · {doc.size}</p><DocumentDate createdAt={doc.createdAt} fallback={doc.date} /><OcrControls document={doc} user={user} /><DocumentAccess document={doc} user={user} notify={notify} /><p dir="auto" className="library-text-snippet">{documentTextSnippet(doc, query)}</p>{actions(doc)}</article>)}</div>}
    <dialog ref={dialog} className="library-preview-dialog" onClose={() => setPreview(null)} aria-labelledby="library-preview-title"><div className="library-preview-heading"><h2 id="library-preview-title">{preview?.name}</h2><button type="button" onClick={() => setPreview(null)} aria-label="Close preview"><X /></button></div>{preview && <><div className="library-preview-content">{preview.type === "pdf" ? <iframe title={`Preview ${preview.name}`} src={`${preview.downloadUrl}?preview=1`} /> : <img alt={preview.name} src={`${preview.downloadUrl}?preview=1`} />}</div><div className="library-preview-footer">{download(preview)}<p>{preview.ocrText}</p></div></>}</dialog>
  </section>;
}
