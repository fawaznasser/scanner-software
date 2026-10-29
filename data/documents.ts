export type DocumentData = {
  id: number;
  documentNumber: string;
  name: string;
  category: string;
  date: string;
  pages: number;
  size: string;
  status: "Completed" | "Processing" | "Failed" | "Not processed";
  sizeBytes?: number;
  ocrStatus?: "queued" | "processing" | "completed" | "failed" | "cancelled";
  ocrProgress?: number;
  ocrError?: string;
  ocrCompletedAt?: string;
  ocrConfidence?: number;
  type: "pdf" | "jpg";
  tags: string[];
  ocrText: string;
  downloadUrl: string;
};

export function fileSizeInMb(size: string) {
  const value = Number.parseFloat(size);
  if (!Number.isFinite(value)) return 0;
  if (size.toUpperCase().includes("KB")) return value / 1024;
  if (size.toUpperCase().includes("GB")) return value * 1024;
  return value;
}

export function getDocumentMetrics(documents: DocumentData[]) {
  const active = documents.filter(document => document.category !== "Trash");
  return {
    totalDocuments: active.length,
    totalPages: active.reduce((total, document) => total + document.pages, 0),
    completed: active.filter((document) => document.status === "Completed").length,
    processing: active.filter((document) => document.status === "Processing" || document.status === "Not processed").length,
    failed: active.filter((document) => document.status === "Failed").length,
    storageMb: documents.reduce((total, document) => total + (document.sizeBytes === undefined ? fileSizeInMb(document.size) : document.sizeBytes / 1024 / 1024), 0),
  };
}
