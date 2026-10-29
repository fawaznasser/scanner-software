import type { DocumentRecord } from "@/lib/documents-store";
import { searchableDocumentText, matchesDocumentQuery, normalizeSearchText } from "@/lib/document-text";

export type LibraryFilters = { query: string; scope: string; category: string; status: string; type: string; from: string; to: string; sort: string };
export function documentDay(document: Pick<DocumentRecord, "createdAt" | "date">) {
  const timestamp = new Date(document.createdAt || document.date);
  return Number.isNaN(timestamp.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}
export function filterLibrary(documents: DocumentRecord[], filters: LibraryFilters) {
  const query = normalizeSearchText(filters.query);
  const searchable = (doc: DocumentRecord) => {
    if (filters.scope === "File names") return doc.name;
    if (filters.scope === "Recognized text") return searchableDocumentText(doc);
    if (filters.scope === "Document details") return [doc.documentNumber, doc.category, doc.ownerName, ...doc.tags].join(" ");
    return [doc.name, doc.documentNumber, doc.category, doc.ownerName, searchableDocumentText(doc), ...doc.tags].join(" ");
  };
  return documents.filter(doc => {
    const day = documentDay(doc);
    return doc.category !== "Trash" && matchesDocumentQuery(searchable(doc), query)
      && (!filters.category || doc.category === filters.category)
      && (!filters.status || doc.status === filters.status)
      && (!filters.type || (filters.type === "pdf" ? doc.type === "pdf" : doc.type !== "pdf"))
      && (!filters.from || (day !== "" && day >= filters.from))
      && (!filters.to || (day !== "" && day <= filters.to));
  }).sort((a, b) => {
    if (filters.sort === "Name") return a.name.localeCompare(b.name);
    if (filters.sort === "Most relevant" && query) {
      const score = (doc: DocumentRecord) => (matchesDocumentQuery(doc.name, query) ? 2 : 0) + (matchesDocumentQuery(doc.documentNumber, query) ? 3 : 0);
      if (score(a) !== score(b)) return score(b) - score(a);
    }
    const stamp = (doc: DocumentRecord) => new Date(doc.createdAt || doc.date).getTime() || 0;
    return (filters.sort === "Oldest first" ? 1 : -1) * (stamp(a) - stamp(b)) || b.id - a.id;
  });
}
