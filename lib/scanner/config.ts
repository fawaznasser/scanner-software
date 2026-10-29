import "server-only";

import type { ScannerProviderKind } from "@/lib/scanner/types";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const provider: ScannerProviderKind = "bridge";

function localKey() {
  const directory = path.join(process.cwd(), ".data", "scanner-bridge");
  const file = path.join(directory, "api-key");
  mkdirSync(directory, { recursive: true });
  if (!existsSync(file)) { try { writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); } catch (error) { if (!existsSync(file)) throw error; } }
  return readFileSync(file, "utf8").trim();
}

export const scannerConfig = {
  provider,
  bridgeUrl: process.env.SCANNER_BRIDGE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8765",
  bridgeApiKey: process.env.SCANNER_BRIDGE_API_KEY || localKey(),
  requestTimeoutMs: positiveNumber(process.env.SCANNER_REQUEST_TIMEOUT_MS, 10_000),
};

export function assertScannerConfiguration() {
  if (scannerConfig.provider === "bridge" && !scannerConfig.bridgeUrl) {
    throw new Error("SCANNER_BRIDGE_URL is required when SCANNER_PROVIDER=bridge");
  }
}
