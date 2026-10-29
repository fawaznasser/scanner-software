"use client";
import { useId, useState } from "react";
import Dropdown from "@/components/dropdown";
import { buildScanTimeline } from "@/lib/statistics-timeline";
import type { ScanDayStatistics, UserScanStatistics } from "@/lib/scan-statistics";

export default function StatisticsChart({ timeline, users, from, to, undatedScans }: { timeline: ScanDayStatistics[]; users: UserScanStatistics[]; from: string; to: string; undatedScans: number }) {
  const [userId, setUserId] = useState("all");
  const [metric, setMetric] = useState<"completedScans" | "pagesScanned">("completedScans");
  const [grouping, setGrouping] = useState<"day" | "month">("day");
  const titleId = useId();
  const descriptionId = useId();
  const effectiveUser = userId === "all" || users.some(user => user.userId === userId) ? userId : "all";
  const selected = users.filter(user => effectiveUser === "all" || user.userId === effectiveUser);
  const chart = buildScanTimeline(timeline, selected.map(user => user.userId), from, to, grouping);
  const label = metric === "completedScans" ? "Completed scans" : "Pages scanned";
  const maximum = Math.max(1, ...chart.points.map(point => point[metric]));
  const axisMax = maximum < 4 ? 4 : Math.ceil(maximum / 4) * 4;
  const width = Math.max(720, chart.points.length * 54 + 90);
  const bottom = 260, left = 64, plotWidth = width - 88;
  const step = plotWidth / Math.max(chart.points.length, 1);
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", chart.grouping === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00Z`));
  return <section className="statistics-chart" aria-labelledby={titleId}>
    <div className="statistics-chart-heading"><div><h2 id={titleId}>Scanning over time</h2><p>Compare activity by day or month. Dates follow Beirut time.</p></div><div className="statistics-chart-controls">
      <label>User<Dropdown aria-label="Chart user" value={effectiveUser} onChange={event => setUserId(event.target.value)}><option value="all">All matching users</option>{users.map(user => <option key={user.userId} value={user.userId}>{user.name}</option>)}</Dropdown></label>
      <label>Show<Dropdown aria-label="Chart measure" value={metric} onChange={event => setMetric(event.target.value as typeof metric)}><option value="completedScans">Completed scans</option><option value="pagesScanned">Pages scanned</option></Dropdown></label>
      <label>Group by<Dropdown aria-label="Chart grouping" value={grouping} onChange={event => setGrouping(event.target.value as typeof grouping)}><option value="day">Day</option><option value="month">Month</option></Dropdown></label>
    </div></div>
    <p id={descriptionId} className="statistics-chart-note">{label} · {selected.length} selected user(s){chart.points.length > 0 && ` · ${formatDate(chart.points[0].date)} – ${formatDate(chart.points[chart.points.length - 1].date)}`}. Empty periods count as zero.{chart.grouping === "month" && grouping === "day" && " Ranges longer than 90 days are grouped by month."}{chart.limited && " Showing the latest 120 months; narrow the date range to see earlier activity."}{undatedScans > 0 && ` ${undatedScans} completed scan(s) have no valid date and are excluded from the chart.`}</p>
    {chart.points.length > 0 && selected.length > 0 ? <>
      <div className="statistics-chart-scroll" tabIndex={0} role="region" aria-label="Scrollable scan activity chart"><svg width={width} height={340} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        {[0,1,2,3,4].map(tick => { const value = axisMax * tick / 4; const y = bottom - 220 * tick / 4; return <g key={tick}><line x1={left} x2={width - 24} y1={y} y2={y} stroke="#dbe5ef" /><text x={left - 12} y={y + 5} textAnchor="end" fill="#40566f" fontSize={14}>{value}</text></g>; })}
        {chart.points.map((point,index) => { const height = point[metric] / axisMax * 220; const x = left + step * index + step / 2; return <g key={point.date}><rect x={x - Math.min(step * .3, 22)} y={bottom - height} width={Math.min(step * .6, 44)} height={height} rx={4} fill={metric === "completedScans" ? "#176bd4" : "#087e68"}><title>{formatDate(point.date)}: {point.completedScans} completed scans, {point.pagesScanned} pages</title></rect><text x={x} y={bottom - height - 9} textAnchor="middle" fill="#203c59" fontWeight={600} fontSize={14}>{point[metric]}</text>{(index % Math.ceil(chart.points.length / 12) === 0 || index === chart.points.length - 1) && <text x={x} y={bottom + 23} transform={`rotate(-30 ${x} ${bottom + 23})`} textAnchor="end" fill="#40566f" fontSize={13}>{formatDate(point.date)}</text>}</g>; })}
      </svg></div>
      <details className="statistics-chart-data"><summary>View chart numbers as a table</summary><div className="statistics-table-wrap"><table><caption className="statistics-caption">Activity for selected users</caption><thead><tr><th>{chart.grouping === "month" ? "Month" : "Date"}</th><th>Completed scans</th><th>Pages scanned</th></tr></thead><tbody>{chart.points.map(point => <tr key={point.date}><td>{formatDate(point.date)}</td><td>{point.completedScans}</td><td>{point.pagesScanned}</td></tr>)}</tbody></table></div></details>
    </> : <p className="statistics-chart-empty">No dated scan activity for these users and dates.</p>}
  </section>;
}
