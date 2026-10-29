import type { ScannerDevice } from "@/lib/scanner/types";

export type DriverStatus = { serviceStatus: string; canRestart: boolean; busy: boolean };

// A check never restarts a working scanner. Restart remains an explicit admin
// choice, and the bridge independently rejects it while a scan is running.
export async function checkScannerConnection({ reconnect, readDriver, confirmRestart }: {
  reconnect: (repairDriver?: boolean) => Promise<ScannerDevice[]>;
  readDriver?: () => Promise<DriverStatus>;
  confirmRestart: () => boolean;
}) {
  let driver: DriverStatus | undefined;
  let driverError = "";
  if (readDriver) {
    try { driver = await readDriver(); }
    catch (error) { driverError = error instanceof Error ? error.message : "Driver status could not be checked."; }
  }
  if (driver?.busy) return "A scan is running. Wait for it to finish; the connection was left unchanged.";

  let devices: ScannerDevice[] = [];
  let connectionError = "";
  try { devices = await reconnect(); }
  catch (error) { connectionError = error instanceof Error ? error.message : "Unable to reconnect the scanner."; }
  if (devices.some(device => device.status === "ready")) return "Scanner connected and ready. Load paper, then select Scan.";
  if (devices.some(device => device.status === "busy")) return "The scanner reports busy. DMS will check again automatically; no service was restarted.";

  const needsRepair = Boolean(connectionError || devices.some(device => device.status === "error") || (driver && driver.serviceStatus.toLowerCase() !== "running"));
  if (needsRepair && driver?.canRestart && confirmRestart()) {
    // Recheck immediately before repair, as another user may have started a scan.
    const latest = await readDriver!();
    if (latest.busy) return "A scan started while checking. Wait for it to finish; no service was restarted.";
    if (!latest.canRestart) return "Windows service restart permission is unavailable. Contact the scanner computer's administrator.";
    const repaired = await reconnect(true);
    return repaired.some(device => device.status === "ready") ? "Scanner connection restored. Load paper, then select Scan." : "The service restarted, but the scanner is not ready. Check its power, USB cable, and feeder.";
  }
  if (needsRepair && driver && !driver.canRestart) return `${connectionError || "The scanner connection needs attention."} Ask the scanner computer's Windows administrator to enable scanner-service control.`;
  return connectionError || (driverError ? `Unable to check the driver: ${driverError}` : "No ready scanner found. Check its power, USB cable, and feeder, then try again.");
}
