import type { ScanJob } from "@/lib/scanner/types";
import type { DmsUser } from "@/data/users";

export type UserScanStatistics = {
  userId: string; name: string; email: string; role: string;
  completedScans: number; pagesScanned: number; unknownPageCounts: number;
  lastScanAt: string | null;
};
export type ScanDayStatistics = { date: string; userId: string; completedScans: number; pagesScanned: number };
export function completedScanDay(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function calculateScanStatistics(users: DmsUser[], jobs: ScanJob[], filters: { from?: string; to?: string } = {}) {
  const rows = new Map<string, UserScanStatistics>(users.map(user => [user.id, { userId: user.id, name: user.name, email: user.email, role: user.role, completedScans: 0, pagesScanned: 0, unknownPageCounts: 0, lastScanAt: null }]));
  const seen = new Set<string>();
  const days = new Map<string, ScanDayStatistics>();
  let undatedScans = 0;
  for (const job of jobs) {
    if (job.provider !== "bridge" || job.status !== "completed" || seen.has(job.id)) continue;
    seen.add(job.id);
    const timestamp = job.updatedAt || job.createdAt;
    const day = completedScanDay(timestamp);
    if ((filters.from && (!day || day < filters.from)) || (filters.to && (!day || day > filters.to))) continue;
    if (!rows.has(job.userId)) rows.set(job.userId, { userId: job.userId, name: "Former account", email: job.userId, role: "Former account", completedScans: 0, pagesScanned: 0, unknownPageCounts: 0, lastScanAt: null });
    const row = rows.get(job.userId)!;
    row.completedScans++;
    const pages = job.result?.pageCount;
    if (typeof pages === "number" && Number.isSafeInteger(pages) && pages > 0) row.pagesScanned += pages;
    else row.unknownPageCounts++;
    if (day) {
      const key = `${day}:${job.userId}`;
      const point = days.get(key) ?? { date: day, userId: job.userId, completedScans: 0, pagesScanned: 0 };
      point.completedScans++;
      if (typeof pages === "number" && Number.isSafeInteger(pages) && pages > 0) point.pagesScanned += pages;
      days.set(key, point);
    } else undatedScans++;
    if (day && (!row.lastScanAt || new Date(timestamp).getTime() > new Date(row.lastScanAt).getTime())) row.lastScanAt = timestamp;
  }
  const usersWithCounts = [...rows.values()].sort((a, b) => b.completedScans - a.completedScans || a.name.localeCompare(b.name));
  return {
    timeline: [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId)),
    undatedScans,
    users: usersWithCounts,
    totals: usersWithCounts.reduce((total, user) => ({ completedScans: total.completedScans + user.completedScans, pagesScanned: total.pagesScanned + user.pagesScanned, unknownPageCounts: total.unknownPageCounts + user.unknownPageCounts, usersWithScans: total.usersWithScans + (user.completedScans > 0 ? 1 : 0) }), { completedScans: 0, pagesScanned: 0, unknownPageCounts: 0, usersWithScans: 0 }),
  };
}
