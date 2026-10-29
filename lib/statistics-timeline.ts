import type { ScanDayStatistics } from "@/lib/scan-statistics";

export function buildScanTimeline(days: ScanDayStatistics[] | null | undefined, userIds: string[], from: string, to: string, grouping: "day" | "month") {
  // An older API response can survive a client refresh during an upgrade.
  // Missing chart data is unavailable, not a measured series of zeroes.
  if (!Array.isArray(days)) return { points: [], grouping, limited: false };
  const selected = new Set(userIds);
  const dates = days.map(day => day.date).sort();
  const start = from || dates[0];
  const end = to || dates[dates.length - 1];
  if (!start || !end || start > end) return { points: [], grouping, limited: false };
  const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  const unit = grouping === "month" || span > 90 ? "month" : "day";
  const key = (date: string) => unit === "month" ? date.slice(0, 7) : date;
  const totals = new Map<string, { completedScans: number; pagesScanned: number }>();
  for (const day of days) {
    if (!selected.has(day.userId) || day.date < start || day.date > end) continue;
    const bucket = key(day.date);
    const point = totals.get(bucket) ?? { completedScans: 0, pagesScanned: 0 };
    point.completedScans += day.completedScans;
    point.pagesScanned += day.pagesScanned;
    totals.set(bucket, point);
  }
  const cursor = new Date(`${unit === "month" ? `${end.slice(0, 7)}-01` : end}T00:00:00Z`);
  const points = [];
  while (key(cursor.toISOString().slice(0, 10)) >= key(start) && points.length < 120) {
    const date = key(cursor.toISOString().slice(0, 10));
    points.push({ date, ...(totals.get(date) ?? { completedScans: 0, pagesScanned: 0 }) });
    if (unit === "month") cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    else cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { points: points.reverse(), grouping: unit, limited: key(cursor.toISOString().slice(0, 10)) >= key(start) };
}
