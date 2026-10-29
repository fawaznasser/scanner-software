import "server-only";
import { spawn } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
import path from "node:path";

let starting: Promise<void> | null = null;
export async function ensureLocalBridge(url: string, apiKey: string) {
  // Only launch the fixed, bundled bridge on this host; never launch commands for remote URLs.
  if (new URL(url).origin !== "http://127.0.0.1:8765" || process.platform !== "win32") return;
  const reachable = async () => {
    try { const response = await fetch(`${url}/v1/health`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(1000), cache: "no-store" }); return response.ok || response.status === 404; }
    catch { return false; }
  };
  if (await reachable()) return;
  if (!starting) starting = (async () => {
    const logs = path.join(process.cwd(), ".data", "run-logs");
    mkdirSync(logs, { recursive: true });
    const out = openSync(path.join(logs, "bridge.out.log"), "a");
    const err = openSync(path.join(logs, "bridge.err.log"), "a");
    try {
      const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "scanner-bridge.mjs")], { cwd: process.cwd(), detached: true, windowsHide: true, stdio: ["ignore", out, err] });
      let spawnError: Error | undefined;
      child.on("error", (error) => { spawnError = error; });
      child.unref();
      for (let attempt = 0; attempt < 20; attempt++) {
        if (spawnError) throw spawnError;
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (await reachable()) return;
      }
      throw new Error("The local scanner connection could not start. Check the scanner connection log.");
    } finally { closeSync(out); closeSync(err); }
  })().finally(() => { starting = null; });
  return starting;
}
