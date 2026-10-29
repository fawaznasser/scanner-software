"use client";
import { useEffect, useState } from "react";
import { FileText, RefreshCw, ScanLine, Users } from "lucide-react";
import DocumentDate from "@/components/document-date";
import type { UserScanStatistics, ScanDayStatistics } from "@/lib/scan-statistics";
import StatisticsChart from "@/components/statistics-chart";
import "@/app/statistics.css";
type Statistics = { users: UserScanStatistics[]; timeline: ScanDayStatistics[]; undatedScans: number; totals: { completedScans: number; pagesScanned: number; unknownPageCounts: number; usersWithScans: number }; generatedAt: string };
export default function StatisticsPage({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    if (from && to && from > to) { setData(null); setLoading(false); setError("The end date must be on or after the start date."); return; }
    const load = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({ from, to });
        const response = await fetch(`/api/statistics?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load scan statistics");
        if (!Array.isArray(payload.timeline)) throw new Error("Chart data is not available yet. Please refresh Statistics to load the latest version.");
        if (!controller.signal.aborted) { setData(payload); setError(""); }
      } catch (error) { if (!controller.signal.aborted) { setData(null); setError(error instanceof Error ? error.message : "Unable to load statistics"); } }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    };
    setData(null); void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [from, to, refresh]);
  const visible = data?.users.filter(user => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <div className="statistics-page">
    <section className="statistics-summary" aria-label="Scan totals">
      <article className="panel"><ScanLine /><div><span>Completed scans</span><strong>{data?.totals.completedScans.toLocaleString() ?? "—"}</strong></div></article>
      <article className="panel"><FileText /><div><span>Pages scanned</span><strong>{data?.totals.pagesScanned.toLocaleString() ?? "—"}</strong></div></article>
      <article className="panel"><Users /><div><span>Users with completed scans</span><strong>{data?.totals.usersWithScans.toLocaleString() ?? "—"}</strong></div></article>
    </section>
    <section className="panel statistics-panel">
      <div className="statistics-filters"><label>Search users<input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Name, email, or role" /></label><label>Completed from<input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label>Completed through<input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label><button onClick={() => { setFrom(""); setTo(""); onQueryChange(""); }}>All dates / clear filters</button><button disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} className={loading ? "spin" : ""} />Refresh</button></div>
      <p className="statistics-explanation">One scan means one successfully completed scanner job. Each captured side counts as a page, so a two-sided sheet counts as two pages. Uploads, failed/cancelled scans, and OCR retries are excluded. Historical counts remain even if a scanned file is later moved or removed.</p>
      {error && <p role="alert" className="statistics-error">{error}</p>}
      {data && (Array.isArray(data.timeline) ? <StatisticsChart timeline={data.timeline} users={visible} from={from} to={to} undatedScans={data.undatedScans} /> : <p role="status" className="statistics-explanation">Updating chart data… Use Refresh if the chart does not appear.</p>)}
      {data && data.totals.unknownPageCounts > 0 && <p role="status">Page totals are unavailable for {data.totals.unknownPageCounts} completed scan(s). Displayed pages include only known counts.</p>}
      <div className="statistics-table-wrap"><table><caption className="statistics-caption">Scan activity per user for the selected period</caption><thead><tr><th>User</th><th>Role</th><th>Completed scans</th><th>Pages scanned</th><th>Last completed scan</th></tr></thead><tbody>{visible.map(user => <tr key={user.userId}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.role}</td><td className="statistics-count">{user.completedScans.toLocaleString()}</td><td className="statistics-count">{user.pagesScanned.toLocaleString()}{user.unknownPageCounts > 0 && <small>{user.unknownPageCounts} scans missing page totals</small>}</td><td>{user.lastScanAt ? <DocumentDate createdAt={user.lastScanAt} fallback="" /> : "No completed scans"}</td></tr>)}{!visible.length && <tr><td colSpan={5}>{loading ? "Loading statistics…" : error ? "Statistics are unavailable." : "No users match your search."}</td></tr>}</tbody></table></div>
      <footer>{data && <span>Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Beirut" })} · Refreshes every 15 seconds while visible.</span>}<span>Completion dates and times use Beirut time. Summary cards cover all users in the selected period.</span></footer>
    </section>
  </div>;
}
