"use client";

import Dropdown from "@/components/dropdown";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe, LockKeyhole, Upload, X } from "lucide-react";
import type { DocumentRecord } from "@/lib/documents-store";
import type { DmsUser } from "@/data/users";
import { patchDocument, uploadDocument } from "@/lib/use-documents";
import { documentCategories } from "@/data/categories";

type Visibility = "private" | "public";
type Scope = "all" | "mine" | "public" | "private";

export function SaveSpace({ value, onChange, label = "Save document to", disabled = false }: {
  value: Visibility; onChange: (value: Visibility) => void; label?: string; disabled?: boolean;
}) {
  const hintId = useId();
  return <label className="save-space"><strong>{label}</strong>
    <Dropdown aria-label={label} value={value} disabled={disabled} aria-describedby={hintId} onChange={(event) => onChange(event.target.value as Visibility)}>
      <option value="private">Private documents</option><option value="public">Public documents</option>
    </Dropdown>
    <small id={hintId}>{value === "private" ? "Only you and administrators can access these files." : "All signed-in users can access these files."}</small>
  </label>;
}

export function useDocumentScope(documents: DocumentRecord[], user: DmsUser | null) {
  const [scope, setScope] = useState<Scope>("all");
  const [owner, setOwner] = useState("all");
  const filtered = useMemo(() => documents.filter((document) =>
    (scope === "all" || (scope === "mine" ? document.visibility === "private" && document.ownerId === user?.id : document.visibility === scope))
    && (owner === "all" || document.ownerId === owner)
  ), [documents, scope, owner, user?.id]);
  return { scope, setScope, owner, setOwner, filtered };
}

export function DocumentSpaceFilters({ documents, user, selection }: {
  documents: DocumentRecord[]; user: DmsUser | null; selection: ReturnType<typeof useDocumentScope>;
}) {
  const owners = [...new Map(documents.map((document) => [document.ownerId, document.ownerName])).entries()];
  const choices: [Scope, string][] = [["all", "All documents"], ["mine", "My private"], ["public", "Public"]];
  if (user?.role === "Administrator") choices.push(["private", "All private"]);
  return <div className="document-space-filters">
    <div className="document-space-tabs" role="group" aria-label="Filter by document space">
      {choices.map(([value, label]) => <button key={value} type="button" aria-pressed={selection.scope === value}
        onClick={() => { selection.setScope(value); selection.setOwner("all"); }}>
        {value === "public" ? <Globe size={16} /> : value !== "all" ? <LockKeyhole size={16} /> : null}{label}
      </button>)}
    </div>
    {user?.role === "Administrator" && <label className="document-owner-filter"><span>Owner</span>
      <Dropdown aria-label="Document owner" value={selection.owner} onChange={(event) => selection.setOwner(event.target.value)}>
        <option value="all">All users</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </Dropdown>
    </label>}
  </div>;
}

export function DocumentAccess({ document, user, notify }: {
  document: DocumentRecord; user: DmsUser | null; notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const canManage = user?.role === "Administrator" || user?.id === document.ownerId;
  return <div className="document-access" onClick={(event) => event.stopPropagation()}>
    <span className={`document-access-badge ${document.visibility}`}>
      {document.visibility === "private" ? <LockKeyhole size={13} /> : <Globe size={13} />}
      {document.visibility === "private" ? "Private" : "Public"}
    </span>
    <span className="document-access-owner">{document.ownerName}</span>
    {canManage && <button type="button" disabled={busy}
      title={`${document.visibility === "private" ? "Share" : "Make private"}: ${document.name}`}
      onClick={async () => {
        setBusy(true);
        try {
          await patchDocument(document.id, { visibility: document.visibility === "private" ? "public" : "private" });
          notify(document.visibility === "private" ? "Document shared with all users" : "Document moved to the owner's private space");
        } catch (error) { notify(error instanceof Error ? error.message : "Unable to change document space"); }
        finally { setBusy(false); }
      }}>{busy ? "Saving…" : document.visibility === "private" ? "Share" : "Make private"}</button>}
  </div>;
}

export function DocumentUploadButton({ notify }: { notify: (message: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [destination, setDestination] = useState<Visibility>("private");
  const [category, setCategory] = useState("Uncategorized");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  return <>
    <button type="button" className="primary document-upload-trigger" onClick={() => {
      setDestination("private"); setCategory("Uncategorized"); setError(""); if (input.current) input.current.value = ""; dialog.current?.showModal();
    }}><Upload size={18} />Upload</button>
    {mounted && createPortal(<dialog ref={dialog} className="document-upload-dialog" aria-labelledby={titleId} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const file = input.current?.files?.[0];
        if (!file || busy) return;
        setBusy(true); setError("");
        try { await uploadDocument(file, destination, category); dialog.current?.close(); notify(`Saved in ${category} · ${destination === "private" ? "Private" : "Public"}`); }
        catch (error) { setError(error instanceof Error ? error.message : "Unable to upload document"); }
        finally { setBusy(false); }
      }}>
        <div className="document-upload-heading"><h2 id={titleId}>Upload document</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Close upload"><X size={22} /></button></div>
        <label className="document-upload-file">Choose a document<input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" required disabled={busy} /><small>PDF, JPEG or PNG · Maximum 25 MB</small></label>
        <label className="document-upload-category"><strong>Category</strong><Dropdown aria-label="Document category" value={category} disabled={busy} onChange={(event) => setCategory(event.target.value)}>{documentCategories.map((item) => <option key={item}>{item}</option>)}</Dropdown></label>
        <SaveSpace value={destination} onChange={setDestination} disabled={busy} />
        {error && <p className="document-upload-error" role="alert">{error}</p>}
        <div className="document-upload-actions"><button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save document"}</button></div>
      </form>
    </dialog>, document.body)}
  </>;
}

