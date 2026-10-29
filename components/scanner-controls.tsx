"use client";
import Dropdown from "@/components/dropdown";
import { documentCategories } from "@/data/categories";
import type { ScannerDevice } from "@/lib/scanner/types";
import { useRef, useState } from "react";
import { RotateCw, PlugZap } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { checkScannerConnection, type DriverStatus } from "@/lib/scanner-connection";

export function ScannerDetails({ scanner, error, reconnect, reconnecting, disabled }: { scanner: ScannerDevice | null; error?: string; reconnect?: (repairDriver?: boolean) => Promise<ScannerDevice[]>; reconnecting?: boolean; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const checkLock = useRef(false);
  const { user } = useSession();
  const status = { loaded: "Paper detected in feeder", empty: "Feeder empty — insert paper before scanning", jammed: "Paper jam — clear the feeder", "cover-open": "Close the feeder cover", unknown: "Paper status unavailable" };
  return <div className="scanner-details" aria-live="polite">
    {reconnect && <button type="button" className="scanner-reconnect-button" disabled={disabled || reconnecting || checking} onClick={async () => {
      if (checkLock.current) return;
      checkLock.current = true;
      setChecking(true); setMessage("");
      try {
        setMessage(await checkScannerConnection({
          reconnect,
          readDriver: user?.role === "Administrator" ? async () => {
            const response = await fetch("/api/scanners/control", { cache: "no-store" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Unable to check driver status");
            return result as DriverStatus;
          } : undefined,
          confirmRestart: () => window.confirm("The connection check could not restore the scanner. Restart the Windows scanning service? This affects other scanning apps on the scanner computer. DMS will refuse a restart while its scanner is active."),
        }));
      } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to restore the scanner connection."); }
      finally { checkLock.current = false; setChecking(false); }
    }}><PlugZap size={17} /><RotateCw size={16} className={checking || reconnecting ? "spin" : ""} />{checking || reconnecting ? "Checking scanner…" : "Check scanner connection"}</button>}
    {scanner && <small>{status[scanner.feederStatus ?? "unknown"]}</small>}
    {error && <p role="alert">{error}</p>}
    {!scanner && !error && !checking && <small>No scanner selected. Use the connection button to check.</small>}
    {message && <span role="status">{message}</span>}
  </div>;
}

export function ScanOutputControls({ category, setCategory, sheetLimit, setSheetLimit, fileFormat, maximum = 50, disabled }: {
  category: string; setCategory: (value: string) => void; sheetLimit: number; setSheetLimit: (value: number) => void;
  fileFormat: string; maximum?: number; disabled?: boolean;
}) {
  return <div className="scan-output-controls">
    <label className="form-field"><span>Category</span><Dropdown aria-label="Scan category" disabled={disabled} value={category} onChange={(event) => setCategory(event.target.value)}>{documentCategories.map((name) => <option key={name}>{name}</option>)}</Dropdown></label>
    <label className="form-field"><span>Maximum sheets</span><Dropdown aria-label="Maximum sheets to scan" disabled={disabled || fileFormat !== "PDF"} value={fileFormat === "PDF" ? String(sheetLimit) : "1"} onChange={(event) => setSheetLimit(Number(event.target.value))}>{[1,5,10,25,50].filter((limit) => limit <= maximum).map((limit) => <option key={limit} value={String(limit)}>{limit === 1 ? "1 sheet" : `Up to ${limit} sheets`}</option>)}</Dropdown></label>
    <small>Stops earlier when the feeder is empty. With both sides enabled, each sheet creates two PDF pages.</small>
  </div>;
}
