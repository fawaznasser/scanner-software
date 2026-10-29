import "server-only";

import { assertScannerConfiguration, scannerConfig } from "@/lib/scanner/config";
import type { BridgeScanUpdate, ScannerDevice, ScanSettings } from "@/lib/scanner/types";
import { ensureLocalBridge } from "@/lib/scanner/local-bridge";

async function bridgeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  assertScannerConfiguration();
  await ensureLocalBridge(scannerConfig.bridgeUrl, scannerConfig.bridgeApiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scannerConfig.requestTimeoutMs);

  try {
    const response = await fetch(`${scannerConfig.bridgeUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(scannerConfig.bridgeApiKey ? { Authorization: `Bearer ${scannerConfig.bridgeApiKey}` } : {}),
        ...init?.headers,
      },
    });

    const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok) throw new Error(data?.error || `Scanner bridge returned HTTP ${response.status}`);
    if (!data) throw new Error("Scanner bridge returned an empty response");
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Scanner bridge request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listBridgeScanners() {
  const response = await bridgeRequest<{ scanners: ScannerDevice[] }>("/v1/scanners");
  if (!Array.isArray(response.scanners)) throw new Error("Scanner bridge returned an invalid scanner list");
  return response.scanners.map((scanner) => ({ ...scanner, provider: "bridge" as const }));
}

export async function reconnectBridge(repairDriver = false) {
  return bridgeRequest<{ scanners: ScannerDevice[] }>(repairDriver ? "/v1/recover-driver" : "/v1/reconnect", { method: "POST" });
}

export function getScannerDriverStatus() {
  return bridgeRequest<{ serviceName: string; serviceStatus: string; canRestart: boolean; account: string; driver: string; busy: boolean }>("/v1/driver");
}

export async function startBridgeScan(scannerId: string, settings: ScanSettings) {
  return bridgeRequest<{ job: BridgeScanUpdate }>("/v1/scan-jobs", {
    method: "POST",
    body: JSON.stringify({ scannerId, settings }),
  });
}

export async function getBridgeScan(providerJobId: string) {
  const response = await bridgeRequest<{ job: BridgeScanUpdate }>(`/v1/scan-jobs/${encodeURIComponent(providerJobId)}`);
  return response.job;
}

export async function cancelBridgeScan(providerJobId: string) {
  await bridgeRequest<{ ok: boolean }>(`/v1/scan-jobs/${encodeURIComponent(providerJobId)}`, { method: "DELETE" });
}

export async function downloadBridgeFile(fileUrl: string) {
  assertScannerConfiguration();
  const bridgeOrigin = new URL(scannerConfig.bridgeUrl).origin;
  const target = new URL(fileUrl, scannerConfig.bridgeUrl);
  if (target.origin !== bridgeOrigin) throw new Error("Scanner bridge returned an untrusted file URL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scannerConfig.requestTimeoutMs * 3);
  try {
    const response = await fetch(target, {
      cache: "no-store",
      signal: controller.signal,
      headers: scannerConfig.bridgeApiKey ? { Authorization: `Bearer ${scannerConfig.bridgeApiKey}` } : undefined,
    });
    if (!response.ok || !response.body) throw new Error(`Unable to download scanned file (HTTP ${response.status})`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
