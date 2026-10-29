"use client";
import { useCallback, useEffect, useState } from "react";
import type { DocumentRecord } from "@/lib/documents-store";

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load documents");
      setDocuments(payload.documents);
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load documents"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    const update = () => void refresh();
    window.addEventListener("documents-updated", update);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(interval); window.removeEventListener("documents-updated", update); window.removeEventListener("focus", update); };
  }, [refresh]);
  return { documents, loading, error, refresh };
}

export async function uploadDocument(file: File, visibility: "private" | "public", category = "Uncategorized") {
  const form = new FormData();
  form.set("file", file);
  form.set("visibility", visibility);
  form.set("category", category);
  const response = await fetch("/api/documents", { method: "POST", body: form });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to upload document");
  window.dispatchEvent(new Event("documents-updated"));
  return payload.document as DocumentRecord;
}

export async function patchDocument(id: number, patch: { visibility?: "private" | "public"; category?: string; deleted?: boolean }) {
  const response = await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Unable to update document");
  window.dispatchEvent(new Event("documents-updated"));
  return payload.document as DocumentRecord;
}
