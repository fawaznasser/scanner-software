"use client";
import { useEffect, useState } from "react";
import { HardDrive, LockKeyhole, ScanLine, Save } from "lucide-react";
import Dropdown from "@/components/dropdown";
import { useScannerBackend, scannerOptions } from "@/lib/use-scanner-backend";
import { useDocuments } from "@/lib/use-documents";
import { getDocumentMetrics } from "@/data/documents";
import { ScannerDetails } from "@/components/scanner-controls";
import { useSession } from "@/lib/use-session";

export default function SettingsPage({ notify }: { notify: (message: string) => void }) {
  const [tab, setTab] = useState("Scanner");
  const [mode, setMode] = useState("Color");
  const [resolution, setResolution] = useState("300 dpi");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { documents } = useDocuments();
  const { selectedScanner, error, reconnectScanner, reconnecting } = useScannerBackend();
  const { user } = useSession();
  const options = scannerOptions(selectedScanner);
  const metrics = getDocumentMetrics(documents);
  const trash = documents.filter(document => document.category === "Trash");
  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem("dms-workspace-settings") || "{}").scanner;
      if (stored?.scanMode) setMode(stored.scanMode);
      if (stored?.resolution) setResolution(stored.resolution);
    } catch { notify("Saved browser defaults could not be loaded."); }
  }, []);
  const saveDefaults = () => {
    try {
      if (!options.modes.includes(mode) || !options.resolutions.includes(resolution)) throw new Error("Choose settings supported by the selected scanner.");
      const stored = JSON.parse(localStorage.getItem("dms-workspace-settings") || "{}");
      localStorage.setItem("dms-workspace-settings", JSON.stringify({ scanner: { ...stored.scanner, scanMode: mode, resolution } }));
      notify("Scanner defaults saved in this browser.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save defaults."); }
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { notify("The password confirmation does not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to change password.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      notify("Password changed. Previous sessions are no longer valid.");
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to change password."); }
    finally { setBusy(false); }
  };
  return <div className="settings-layout">
    <aside className="panel settings-nav" aria-label="Settings sections">{[["Scanner", ScanLine], ["Storage", HardDrive], ["Account security", LockKeyhole]].map(([label, Icon]) => <button type="button" key={String(label)} className={tab === label ? "active" : ""} onClick={() => setTab(String(label))}><Icon />{String(label)}</button>)}</aside>
    <section className="panel settings-content">
      {tab === "Scanner" && <><h2>Scanner connection and defaults</h2><p>Defaults are saved in this browser, not across the workspace. A saved scan profile takes precedence.</p><ScannerDetails scanner={selectedScanner} error={error} reconnect={reconnectScanner} reconnecting={reconnecting} />
        <div className="settings-two"><label className="form-field"><span>Default scan mode</span><Dropdown aria-label="Default scan mode" value={mode} onChange={event => setMode(event.target.value)}>{options.modes.map(value => <option key={value}>{value}</option>)}</Dropdown></label>
        <label className="form-field"><span>Default resolution</span><Dropdown aria-label="Default resolution" value={resolution} onChange={event => setResolution(event.target.value)}>{options.resolutions.map(value => <option key={value}>{value}</option>)}</Dropdown></label></div>
        <div className="settings-save"><button type="button" className="primary" onClick={saveDefaults}><Save />Save browser defaults</button></div><p>Local English, Arabic and French text recognition runs after saving documents. Automatic archiving and email notifications are not configured.</p></>}
      {tab === "Storage" && <><h2>Document storage</h2><p>{metrics.storageMb.toFixed(2)} MB in {documents.length} accessible stored files.</p><p>{trash.length} files are in trash. Trash retains files; it does not free disk space.</p><p>Storage is on the DMS server. No workspace quota is configured.</p><p>Scanner captures and diagnostic files also consume disk space and are not included in this document-library total. Configure and verify backups before production use.</p></>}
      {tab === "Account security" && <><h2>Account security</h2><p>{user?.name} · {user?.email}</p><p>Sessions expire eight hours after sign-in. Changing your password invalidates previous sessions. Two-factor authentication is not implemented.</p>
        <form className="settings-inline-panel password-panel" onSubmit={event => void changePassword(event)}><label>Current password<input type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label>New password (12–128 characters)<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Updating…" : "Change password"}</button></form></>}
    </section>
  </div>;
}
