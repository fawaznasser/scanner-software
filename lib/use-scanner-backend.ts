"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicScanJob, ScanFileFormat, ScanSettings, ScannerDevice } from "@/lib/scanner/types";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

export function scannerOptions(scanner: ScannerDevice | null) {
  const caps = scanner?.capabilities;
  const formats = { "searchable-pdf": "Searchable PDF", pdf: "PDF", jpeg: "JPEG", png: "PNG" };
  const modes = { color: "Color", grayscale: "Grayscale", "black-white": "Black & White" };
  return {
    modes: caps ? caps.colorModes.map((value) => modes[value]) : ["Color", "Grayscale", "Black & White"],
    papers: caps ? caps.paperSizes.map((value) => value === "Auto" ? "Auto detect" : value) : ["A4", "Letter", "Legal"],
    resolutions: caps ? caps.resolutions.map((value) => `${value} dpi`) : ["300 dpi", "600 dpi"],
    formats: caps ? caps.formats.map((value) => formats[value]) : ["PDF", "JPEG", "PNG"],
  };
}

export function readScanDefaults() {
  try {
    const preferences = JSON.parse(window.localStorage.getItem("dms-workspace-settings") ?? "{}").scanner ?? {};
    const profile = JSON.parse(window.localStorage.getItem("docscan-profile") ?? "{}");
    return { ...preferences, ...profile } as { scanMode?: string; resolution?: string; paperSize?: string; fileFormat?: string; duplex?: boolean; feeder?: boolean; sheetLimit?: number; scanCategory?: string; saveSpace?: "private" | "public" };
  } catch { return {}; }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "The scanner service could not complete the request.");
  return payload;
}

export function createScanSettings({
  scanMode,
  paperSize,
  resolution,
  fileFormat,
  duplex,
  feeder,
  enhance = false,
  visibility = "private",
  category = "Uncategorized",
  sheetLimit = 1,
}: {
  scanMode: string;
  paperSize: string;
  resolution: string;
  fileFormat: string;
  duplex: boolean;
  feeder: boolean;
  enhance?: boolean;
  visibility?: "private" | "public";
  category?: string;
  sheetLimit?: number;
}): ScanSettings {
  const colorModes: Record<string, ScanSettings["colorMode"]> = {
    Color: "color",
    Grayscale: "grayscale",
    "Black & White": "black-white",
  };
  const formats: Record<string, ScanFileFormat> = {
    "Searchable PDF": "searchable-pdf",
    PDF: "pdf",
    JPEG: "jpeg",
    PNG: "png",
  };
  const extension = fileFormat === "JPEG" ? "jpg" : fileFormat === "PNG" ? "png" : "pdf";
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "_").slice(0, 15);

  return {
    visibility,
    category,
    source: feeder ? "automatic-feeder" : "flatbed",
    colorMode: colorModes[scanMode] ?? "color",
    paperSize: paperSize === "Auto detect" ? "Auto" : paperSize as ScanSettings["paperSize"],
    resolution: Number.parseInt(resolution, 10) || 300,
    format: formats[fileFormat] ?? "searchable-pdf",
    duplex,
    autoFeed: feeder && sheetLimit > 1,
    enhance,
    pageLimit: feeder && fileFormat === "PDF" ? sheetLimit : 1,
    fileName: `Scan_${timestamp}.${extension}`,
  };
}

export function useScannerBackend() {
  const [scanners, setScanners] = useState<ScannerDevice[]>([]);
  const [selectedScannerId, setSelectedScannerId] = useState("");
  const [jobs, setJobs] = useState<PublicScanJob[]>([]);
  const [activeJob, setActiveJob] = useState<PublicScanJob | null>(null);
  const [loadingScanners, setLoadingScanners] = useState(true);
  const [refreshingScanners, setRefreshingScanners] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const startLock = useRef(false);
  const scanInProgress = useRef(false);
  scanInProgress.current = starting || Boolean(activeJob && !terminalStatuses.has(activeJob.status));
  const [reconnecting, setReconnecting] = useState(false);

  const refreshScanners = useCallback(async () => {
    setRefreshingScanners(true);
    try {
      const result = await readJson<{ scanners: ScannerDevice[] }>(await fetch("/api/scanners", { cache: "no-store" }));
      setScanners(result.scanners);
      setSelectedScannerId((current) => result.scanners.some((scanner) => scanner.id === current)
        ? current
        : (result.scanners.find((scanner) => scanner.status === "ready") ?? result.scanners[0])?.id ?? current);
      setError("");
      return result.scanners;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to discover scanners.";
      setError(message);
      setScanners((current) => current.map(scanner => ({ ...scanner, status: "error" })));
      throw requestError;
    } finally {
      setLoadingScanners(false);
      setRefreshingScanners(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const result = await readJson<{ jobs: PublicScanJob[] }>(await fetch("/api/scan-jobs", { cache: "no-store" }));
      setJobs(result.jobs);
      setActiveJob((current) => result.jobs.find((job) => !terminalStatuses.has(job.status)) ?? current);
      return result.jobs;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load scan jobs.");
      throw requestError;
    }
  }, []);

  const reconnectScanner = useCallback(async (repairDriver = false) => {
    setReconnecting(true);
    try {
      const result = await readJson<{ scanners: ScannerDevice[] }>(await fetch("/api/scanners/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: repairDriver ? "repair-driver" : "reconnect" }) }));
      setScanners(result.scanners);
      setSelectedScannerId((current) => result.scanners.some((scanner) => scanner.id === current) ? current : result.scanners[0]?.id ?? current);
      setError("");
      return result.scanners;
    } catch (requestError) {
      setScanners((current) => current.map(scanner => ({ ...scanner, status: "error" })));
      setError(requestError instanceof Error ? requestError.message : "Unable to reconnect scanner");
      throw requestError;
    } finally { setReconnecting(false); }
  }, []);

  useEffect(() => {
    void refreshScanners().catch(() => undefined);
    void refreshJobs().catch(() => undefined);
    const onFocus = () => {
      if (!startLock.current && !scanInProgress.current) void refreshScanners().catch(() => undefined);
      void refreshJobs().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshJobs, refreshScanners]);

  useEffect(() => {
    if (!activeJob || terminalStatuses.has(activeJob.status)) return;
    let disposed = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await readJson<{ job: PublicScanJob }>(await fetch(`/api/scan-jobs/${activeJob.id}`, { cache: "no-store" }));
        if (disposed) return;
        setActiveJob(result.job);
        setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      } catch (requestError) {
        if (!disposed) setError(requestError instanceof Error ? requestError.message : "Unable to check scan progress.");
      } finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 600);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.status]);

  // WIA may need a moment to release the feeder. Recheck automatically after
  // completion/cancellation and while another application has the device busy.
  useEffect(() => {
    if (starting || (activeJob && !terminalStatuses.has(activeJob.status))) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !scanInProgress.current) void refreshScanners().catch(() => undefined);
    }, 15000);
    const recheck = window.setTimeout(() => void refreshScanners().catch(() => undefined), 3000);
    return () => { window.clearInterval(timer); window.clearTimeout(recheck); };
  }, [starting, activeJob?.id, activeJob?.status, refreshScanners]);

  const startScan = useCallback(async (settings: ScanSettings) => {
    if (startLock.current) return;
    if (!selectedScannerId) throw new Error("Select a connected scanner first.");
    startLock.current = true;
    setStarting(true);
    try {
    const result = await readJson<{ job: PublicScanJob }>(await fetch("/api/scan-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scannerId: selectedScannerId, settings }),
    }));
    setActiveJob(result.job);
    setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
    setError("");
    return result.job;
    } finally { startLock.current = false; setStarting(false); }
  }, [selectedScannerId]);

  const cancelScan = useCallback(async () => {
    if (!activeJob || terminalStatuses.has(activeJob.status)) return;
    const result = await readJson<{ job: PublicScanJob }>(await fetch(`/api/scan-jobs/${activeJob.id}`, { method: "DELETE" }));
    setActiveJob(result.job);
    setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
  }, [activeJob]);

  const selectedScanner = useMemo(
    () => {
      const scanner = scanners.find((scanner) => scanner.id === selectedScannerId);
      if (!scanner) return null;
      return scanInProgress.current ? { ...scanner, status: "busy" as const, feederStatus: "unknown" as const } : scanner;
    },
    [scanners, selectedScannerId, starting, activeJob?.status],
  );

  return {
    scanners,
    selectedScannerId,
    setSelectedScannerId,
    selectedScanner,
    jobs,
    activeJob,
    loadingScanners,
    refreshingScanners,
    error,
    starting,
    reconnecting,
    reconnectScanner,
    refreshScanners,
    refreshJobs,
    startScan,
    cancelScan,
  };
}
