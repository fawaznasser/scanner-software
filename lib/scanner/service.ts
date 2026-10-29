import "server-only";

import { randomUUID } from "node:crypto";
import { saveDocument } from "@/lib/documents-store";
import { parseDocumentCategory } from "@/data/categories";
import { downloadBridgeFile } from "@/lib/scanner/bridge-client";
import { scannerConfig } from "@/lib/scanner/config";
import { cancelBridgeScan, getBridgeScan, listBridgeScanners, startBridgeScan } from "@/lib/scanner/bridge-client";
import { findScanJob, listUserScanJobs, saveScanJob, updateScanJob } from "@/lib/scanner/store";
import type {
  BridgeScanUpdate,
  PublicScanJob,
  ScannerDevice,
  ScanColorMode,
  ScanFileFormat,
  ScanJob,
  ScanPaperSize,
  ScanSettings,
  ScanSource,
} from "@/lib/scanner/types";

export async function listScanners() { return listBridgeScanners(); }

export async function getScanner(scannerId: string) {
  const scanners = await listScanners();
  return scanners.find((scanner) => scanner.id === scannerId) ?? null;
}

function cleanFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 100);
  return cleaned || `Scan_${Date.now()}`;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function parseScanSettings(input: unknown): ScanSettings {
  if (!input || typeof input !== "object") throw new Error("Scan settings are required");
  const value = input as Record<string, unknown>;
  if (value.visibility !== undefined && value.visibility !== "private" && value.visibility !== "public") throw new Error("Choose Private or Public as the document space");
  const sources: ScanSource[] = ["automatic-feeder", "flatbed"];
  const colorModes: ScanColorMode[] = ["color", "grayscale", "black-white"];
  const paperSizes: ScanPaperSize[] = ["A4", "Letter", "Legal", "Auto"];
  const formats: ScanFileFormat[] = ["searchable-pdf", "pdf", "jpeg", "png"];

  if (!isOneOf(value.source, sources)) throw new Error("Choose a valid scan source");
  if (!isOneOf(value.colorMode, colorModes)) throw new Error("Choose a valid color mode");
  if (!isOneOf(value.paperSize, paperSizes)) throw new Error("Choose a valid paper size");
  if (!isOneOf(value.format, formats)) throw new Error("Choose a valid output format");
  if (typeof value.resolution !== "number" || !Number.isInteger(value.resolution) || value.resolution < 50 || value.resolution > 1200) throw new Error("Choose a supported resolution");

  const pageLimit = value.pageLimit === undefined ? 1 : value.pageLimit;
  if (typeof pageLimit !== "number" || !Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 50) throw new Error("Sheet limit must be a whole number between 1 and 50");
  if (value.enhance === true) throw new Error("Automatic image enhancement is not configured.");
  if (value.format === "searchable-pdf") throw new Error("Searchable PDF output is not available. Choose PDF, JPEG or PNG; DMS reads text in the background after saving.");

  return {
    category: parseDocumentCategory(value.category),
    visibility: value.visibility === "public" ? "public" : "private",
    source: value.source,
    colorMode: value.colorMode,
    paperSize: value.paperSize,
    resolution: value.resolution,
    format: value.format,
    duplex: value.duplex === true,
    autoFeed: value.autoFeed === true,
    enhance: value.enhance === true,
    pageLimit,
    fileName: cleanFileName(typeof value.fileName === "string" ? value.fileName : `Scan_${Date.now()}`),
  };
}

function validateCapabilities(scanner: ScannerDevice, settings: ScanSettings) {
  const capabilities = scanner.capabilities;
  if (scanner.status !== "ready") throw new Error(`Scanner is ${scanner.status}`);
  if (!capabilities.sources.includes(settings.source)) throw new Error("The selected scan source is not supported");
  if (!capabilities.colorModes.includes(settings.colorMode)) throw new Error("The selected color mode is not supported");
  if (!capabilities.paperSizes.includes(settings.paperSize)) throw new Error("The selected paper size is not supported");
  if (!capabilities.resolutions.includes(settings.resolution)) throw new Error("The selected resolution is not supported");
  if (!capabilities.formats.includes(settings.format)) throw new Error("The selected file format is not supported");
  if (settings.duplex && !capabilities.supportsDuplex) throw new Error("This scanner does not support duplex scanning");
  if (settings.duplex && (settings.source !== "automatic-feeder" || settings.format !== "pdf")) throw new Error("Choose the automatic feeder and PDF format to scan both sides");
  if (settings.autoFeed && !capabilities.supportsAutoFeed) throw new Error("This scanner does not have an automatic feeder");
  if (settings.pageLimit > capabilities.maxFeederPages && settings.source === "automatic-feeder") throw new Error(`This feeder supports up to ${capabilities.maxFeederPages} pages`);
}

function publicJob(job: ScanJob): PublicScanJob {
  const { userId: _userId, providerJobId: _providerJobId, sourceFileUrl: _sourceFileUrl, ...safeJob } = job;
  return safeJob;
}

function applyBridgeUpdate(job: ScanJob, update: BridgeScanUpdate) {
  const pageCount = update.pageCount ?? job.result?.pageCount ?? 0;
  const completedResult = update.status === "completed" ? {
    fileName: update.fileName || `${job.settings.fileName}.pdf`,
    mimeType: update.mimeType || "application/pdf",
    pageCount,
    sizeBytes: update.sizeBytes ?? 0,
    downloadUrl: `/api/scan-jobs/${job.id}/file`,
  } : job.result;

  return updateScanJob(job.id, {
    status: update.status,
    progress: Math.max(0, Math.min(100, Math.round(update.progress))),
    result: completedResult,
    sourceFileUrl: update.fileUrl ?? job.sourceFileUrl,
    error: update.error,
  });
}

const savingDocuments = new Map<string, Promise<ScanJob>>();
async function archiveCompletedJob(job: ScanJob): Promise<ScanJob> {
  if (job.status !== "completed" || !job.result || job.result.documentId || job.provider !== "bridge") return job;
  const pending = savingDocuments.get(job.id);
  if (pending) return pending;
  const task = (async () => {
    if (!job.sourceFileUrl) throw new Error("Scanner did not provide a file to save.");
    const response = await downloadBridgeFile(job.sourceFileUrl);
    if (!response.body) throw new Error("Scanner returned an empty file.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 100 * 1024 * 1024) throw new Error("Scanned document exceeds the 100 MB limit.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    if (!length) throw new Error("Scanner returned an empty file.");
    const result = job.result!;
    const document = saveDocument({ ownerId: job.userId, visibility: job.settings.visibility ?? "private", category: job.settings.category, name: result.fileName, mimeType: result.mimeType, pages: result.pageCount, bytes: Buffer.concat(chunks), scanJobId: job.id });
    return updateScanJob(job.id, { result: { ...result, documentId: document.id, downloadUrl: document.downloadUrl, sizeBytes: length }, error: undefined }) ?? job;
  })();
  savingDocuments.set(job.id, task);
  try { return await task; } finally { savingDocuments.delete(job.id); }
}

async function refreshJob(job: ScanJob) {
  if (["failed", "cancelled"].includes(job.status)) return job;
  if (job.status === "completed") return archiveCompletedJob(job);
  if (job.provider !== "bridge") return updateScanJob(job.id, { status: "failed", error: "Simulated scan jobs are not supported." }) ?? job;
  if (!job.providerJobId) return updateScanJob(job.id, { status: "failed", error: "Scanner bridge job ID is missing" }) ?? job;

  try {
    const update = await getBridgeScan(job.providerJobId);
    return await archiveCompletedJob(applyBridgeUpdate(job, update) ?? job);
  } catch (error) {
    return updateScanJob(job.id, { status: "failed", error: error instanceof Error ? error.message : "Scanner bridge error" }) ?? job;
  }
}

export async function createScanJob(userId: string, scannerId: string, settings: ScanSettings) {
  const scanner = await getScanner(scannerId);
  if (!scanner) throw new Error("Scanner not found");
  validateCapabilities(scanner, settings);
  const now = new Date().toISOString();
  const job: ScanJob = {
    id: randomUUID(),
    userId,
    scannerId,
    scannerName: scanner.name,
    provider: scanner.provider,
    status: "queued",
    progress: 0,
    settings,
    createdAt: now,
    updatedAt: now,
  };

  if (scanner.provider === "bridge") {
    const response = await startBridgeScan(scannerId, settings);
    if (!response.job?.jobId) throw new Error("Scanner bridge did not return a job ID");
    job.providerJobId = response.job.jobId;
    job.status = response.job.status ?? "queued";
    job.progress = response.job.progress ?? 0;
  }

  saveScanJob(job);
  return publicJob(job);
}

export async function getUserScanJob(id: string, userId: string, isAdministrator: boolean) {
  const job = findScanJob(id);
  if (!job || job.provider !== "bridge" || (!isAdministrator && job.userId !== userId)) return null;
  return publicJob(await refreshJob(job));
}

export async function getInternalScanJob(id: string, userId: string, isAdministrator: boolean) {
  const job = findScanJob(id);
  if (!job || job.provider !== "bridge" || (!isAdministrator && job.userId !== userId)) return null;
  return refreshJob(job);
}

export async function getUserScanJobs(userId: string) {
  const jobs = await Promise.all(listUserScanJobs(userId).filter(job => job.provider === "bridge").slice(0, 25).map(refreshJob));
  return jobs.map(publicJob);
}

export async function cancelUserScanJob(id: string, userId: string, isAdministrator: boolean) {
  const job = findScanJob(id);
  if (!job || (!isAdministrator && job.userId !== userId)) return null;
  if (["completed", "failed", "cancelled"].includes(job.status)) return publicJob(job);
  if (job.provider === "bridge" && job.providerJobId) await cancelBridgeScan(job.providerJobId);
  return publicJob(updateScanJob(job.id, { status: "cancelled", progress: job.progress }) ?? job);
}
