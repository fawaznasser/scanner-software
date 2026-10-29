import type { DocumentData } from "@/data/documents";

export function normalizeSearchText(text: string) {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/\u0640/g, "").replace(/\u0671/g, "ا").replace(/\u0649/g, "ي").toLowerCase().replace(/\s+/g, " ").trim();
}
export function matchesDocumentQuery(text: string, query: string) {
  const content = normalizeSearchText(text);
  return normalizeSearchText(query).split(" ").every(word => content.includes(word));
}

export function documentTextSnippet(doc: Pick<DocumentData, "ocrText">, query: string) {
  const text = searchableDocumentText(doc);
  if (!text) return "";
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const index = words.length ? lines.findIndex(line => words.some(word => normalizeSearchText(line).includes(word))) : 0;
  return lines.slice(Math.max(0, index), Math.max(0, index) + 3).join(" ").slice(0, 500);
}

/** Status messages are UI metadata, never words extracted from a paper. */
export function searchableDocumentText(doc: Pick<DocumentData, "ocrText">) {
  const text = doc.ocrText?.trim() || "";
  if (/^Text recognition has not been run for this document\.?$/i.test(text)) return "";
  return text;
}
