"use client";

import Dropdown from "@/components/dropdown";
import DocumentDate from "@/components/document-date";
import DocumentLibrary from "@/components/document-library";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  Filter,
  Folder,
  FolderPlus,
  Gauge,
  Grid2X2,
  Home,
  List,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  MoveRight,
  PanelLeftClose,
  Plus,
  RefreshCw,
  RotateCw,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDocumentMetrics, type DocumentData } from "@/data/documents";
import { documentCategories } from "@/data/categories";
import type { AuditAction, AuditLog } from "@/data/audit-logs";
import { dmsUsers, type UserRole, type DmsUser } from "@/data/users";
import { useSession } from "@/lib/use-session";
import { createScanSettings, useScannerBackend, scannerOptions, readScanDefaults } from "@/lib/use-scanner-backend";
import SettingsPage from "@/components/settings-page";
import StatisticsPage from "@/components/statistics-page";
import { ScannerDetails, ScanOutputControls } from "@/components/scanner-controls";
import { useDocuments } from "@/lib/use-documents";
import { SaveSpace, DocumentSpaceFilters, DocumentAccess, DocumentUploadButton, useDocumentScope } from "@/components/document-spaces";
import type { DocumentRecord } from "@/lib/documents-store";

type Section = "scan-documents" | "all-documents" | "categories" | "users" | "statistics" | "logs" | "settings";
type Status = DocumentData["status"];
type Doc = DocumentData;

const navigation = [
  ["Dashboard", Home, "/"],
  ["Scan Documents", ScanLine, "/scan-documents"],
  ["All Documents", FileArchive, "/all-documents"],
  ["Categories", Folder, "/categories"],
  ["Users", Users, "/users"],
  ["Statistics", BarChart3, "/statistics"],
  ["Audit Logs", Activity, "/logs"],
  ["Settings", Settings, "/settings"],
] as const;

const titles: Record<Section, [string, string]> = {
  "scan-documents": ["Scan Documents", "Capture, enhance, and digitize paper documents"],
  "all-documents": ["All Documents", "Browse, search, preview, and manage your documents in one place"],
  categories: ["Categories", "Group documents into organized collections"],
  users: ["Users", "Manage workspace members and permissions"],
  statistics: ["Statistics", "See completed scans and pages scanned by each user"],
  logs: ["Audit Logs", "Review sign-ins, scans, uploads, and changes to documents"],
  settings: ["Settings", "Configure your DMS workspace"],
};

const CNRS_LOGO_URL = "https://pbs.twimg.com/profile_images/1914297483871551488/QOWuSKqc.jpg";

export default function SectionApp({ section }: { section: string }) {
  const activeSection = section as Section;
  const { documents: accessibleDocuments, error: documentsError } = useDocuments();
  const documentMetrics = getDocumentMetrics(accessibleDocuments);
  const storagePercent = documentMetrics.storageMb / (1024 * 1024) * 100;
  const storagePercentLabel = storagePercent < 0.01 ? "<0.01%" : `${storagePercent.toFixed(2)}%`;
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, signOut } = useSession();
  const documentScope = useDocumentScope(accessibleDocuments, user);
  const spaceDocuments = documentScope.filtered.filter(document => document.category !== "Trash");
  const spaceFilters = <DocumentSpaceFilters documents={accessibleDocuments} user={user} selection={documentScope} />;
  const canManageWorkspace = user?.role === "Administrator";

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2300);
  };

  return <div className="app-shell section-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand">
        <div className="brand-mark cnrs-brand-mark"><img src={CNRS_LOGO_URL} alt="CNRS-L logo" /></div>
        <div><strong>DMS</strong><span>CNRS document management System</span></div>
        <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
      </div>
      <nav>{navigation.filter(([, , href]) => canManageWorkspace || !["/users", "/statistics", "/logs", "/settings"].includes(href)).map(([label, Icon, href]) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className={`nav-item ${href === `/${activeSection}` ? "active" : ""}`}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      <div className="storage-meter"><span>Storage Usage</span><small>{documentMetrics.storageMb.toFixed(2)} MB in accessible files</small></div>
    </aside>

    <main>
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
        <label className="global-search"><Search size={19} /><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder={activeSection === "statistics" ? "Search users by name, email, or role…" : "Search by name, number, or document text…"} aria-label={activeSection === "statistics" ? "Search users" : "Search documents"} /></label>
        <div className="profile-area">
          <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><div className="avatar">{user?.initials ?? "--"}</div><div className="profile-copy"><strong>{user?.name ?? "Loading…"}</strong><span>{user?.role ?? ""}</span></div><ChevronDown size={17} /></button>
          {profileOpen && <div className="header-popover profile-popover"><p>{user?.name}<br />{user?.email}<br />{user?.role}</p>{canManageWorkspace && <Link href="/settings"><Settings />Workspace settings</Link>}<button onClick={signOut}><LockKeyhole />Sign out</button></div>}
        </div>
      </header>

      <div className="section-workspace">
        <div className="page-heading"><div><p>Workspace <ChevronRight /> {titles[activeSection][0]}</p><h1>{titles[activeSection][0]}</h1><span>{titles[activeSection][1]}</span></div><PageActions section={activeSection} notify={notify} /></div>
        {activeSection === "scan-documents" && <ScanPage notify={notify} />}
        {documentsError && <p role="alert">{documentsError}</p>}
        {activeSection === "all-documents" && <DocumentLibrary user={user} controls={spaceFilters} docs={spaceDocuments} notify={notify} query={globalSearch} onQueryChange={setGlobalSearch} />}
        {activeSection === "categories" && spaceFilters}
        {activeSection === "categories" && <CategoriesPage docs={spaceDocuments} notify={notify} />}
        {activeSection === "users" && <UsersPage notify={notify} />}
        {activeSection === "statistics" && <StatisticsPage query={globalSearch} onQueryChange={setGlobalSearch} />}
        {activeSection === "logs" && <LogsPage notify={notify} />}
        {activeSection === "settings" && <SettingsPage notify={notify} />}
      </div>
    </main>
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

function PageActions(_props: { section: Section; notify: (message: string) => void }) { return null; }

function ScanPage({ notify }: { notify: (message: string) => void }) {
  const [scanCategory, setScanCategory] = useState("Uncategorized");
  const [sheetLimit, setSheetLimit] = useState(1);
  const [saveSpace, setSaveSpace] = useState<"private" | "public">("private");
  const [duplex, setDuplex] = useState(true);
  const [feeder, setFeeder] = useState(true);
  const [enhance, setEnhance] = useState(true);
  const [scanMode, setScanMode] = useState("Color");
  const [paperSize, setPaperSize] = useState("A4");
  const [resolution, setResolution] = useState("300 dpi");
  const [fileFormat, setFileFormat] = useState("Searchable PDF");
  const reportedJobs = useRef(new Set<string>());
  const defaultsApplied = useRef(false);
  const {
    scanners,
    selectedScannerId,
    setSelectedScannerId,
    selectedScanner,
    jobs,
    activeJob,
    loadingScanners,
    refreshingScanners,
    refreshScanners,
    refreshJobs,
    startScan,
    cancelScan,
    starting,
    error: scannerError,
    reconnectScanner,
    reconnecting,
  } = useScannerBackend();
  const scanning = starting || Boolean(activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status));
  const progress = activeJob?.progress ?? 0;
  const scanOptions = scannerOptions(selectedScanner);
  useEffect(() => {
    if (!selectedScanner) return;
    const options = scannerOptions(selectedScanner);
    if (!defaultsApplied.current) {
      defaultsApplied.current = true;
      const profile = readScanDefaults();
      if (profile.scanMode && options.modes.includes(profile.scanMode)) setScanMode(profile.scanMode);
      if (profile.resolution && options.resolutions.includes(profile.resolution)) setResolution(profile.resolution);
      if (profile.paperSize && options.papers.includes(profile.paperSize)) setPaperSize(profile.paperSize);
      if (profile.fileFormat && options.formats.includes(profile.fileFormat)) setFileFormat(profile.fileFormat);
      if (profile.duplex && selectedScanner.capabilities.supportsDuplex && (profile.fileFormat ?? "PDF") === "PDF") setDuplex(true);
      if (profile.sheetLimit && [1,5,10,25,50].includes(profile.sheetLimit)) setSheetLimit(profile.sheetLimit);
    }
    setScanMode((value) => options.modes.includes(value) ? value : options.modes[0]);
    setPaperSize((value) => options.papers.includes(value) ? value : options.papers[0]);
    setResolution((value) => options.resolutions.includes(value) ? value : options.resolutions[0]);
    setFileFormat((value) => options.formats.includes(value) ? value : options.formats[0]);
    if (!selectedScanner.capabilities.supportsDuplex) setDuplex(false);
    if (!selectedScanner.capabilities.sources.includes("flatbed")) setFeeder(true);
    setEnhance(false);
  }, [selectedScanner]);

  useEffect(() => {
    if (!activeJob || reportedJobs.current.has(activeJob.id)) return;
    if (activeJob.status === "completed" && activeJob.result) {
      reportedJobs.current.add(activeJob.id);
      notify(`${activeJob.result.pageCount} page${activeJob.result.pageCount === 1 ? "" : "s"} scanned successfully`);
    } else if (activeJob.status === "failed" || activeJob.status === "cancelled") {
      reportedJobs.current.add(activeJob.id);
      notify(activeJob.error || (activeJob.status === "cancelled" ? "Scan cancelled" : "The scanner could not finish the job"));
    }
  }, [activeJob, notify]);

  const scan = async () => {
    if (scanning) return;
    try {
      await startScan(createScanSettings({ scanMode, paperSize, resolution, fileFormat, duplex, feeder, enhance, visibility: saveSpace, category: scanCategory, sheetLimit }));
      notify("Scan started on the connected scanner");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to start the scanner");
    }
  };

  const refreshDevices = async () => {
    try {
      const discovered = await refreshScanners();
      notify(discovered.length ? `${discovered.length} scanner${discovered.length === 1 ? "" : "s"} found` : "No scanner was found");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to refresh scanners");
    }
  };

  const statusLabel = (status: string) => ({ queued: "Queued", scanning: "Scanning", processing: "Preparing file", completed: "Completed", failed: "Failed", cancelled: "Cancelled", ready: "Ready", busy: "Busy", offline: "Offline", error: "Error" }[status] ?? status);
  const jobMeta = (job: typeof jobs[number]) => {
    const pages = job.result?.pageCount;
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(job.createdAt));
    return `${pages ? `${pages} page${pages === 1 ? "" : "s"}` : `${job.progress}%`} · ${time}`;
  };

  return <div className="scan-page-grid">
    <section className="panel scan-setup-card">
      <div className="card-title"><div><span className="title-icon blue"><ScanLine /></span><div><h2>Scanner Setup</h2><p>Configure your source and output settings</p></div></div><span className={`connected large ${selectedScanner?.status === "ready" ? "" : "offline"}`}><i />{refreshingScanners ? "Checking…" : scanning ? "Scan in progress" : selectedScanner?.status === "ready" ? "Scanner ready" : selectedScanner?.status === "busy" ? "Scanner busy — please wait" : selectedScanner?.status === "error" ? "Connection check failed — retrying" : "Scanner unavailable"}</span></div>
      <div className="device-select"><div className="device-icon"><ScanLine /></div><label><span>Selected scanner</span><Dropdown aria-label="Selected scanner" value={selectedScannerId} onChange={(event) => setSelectedScannerId(event.target.value)} disabled={scanning || loadingScanners}>{!scanners.length && <option value="">No scanner found</option>}{scanners.map((scanner) => <option key={scanner.id} value={scanner.id}>{scanner.name}</option>)}</Dropdown><small>{selectedScanner ? `${selectedScanner.connection} · ${statusLabel(selectedScanner.status)}` : "Refresh to discover a device"}</small></label><ChevronDown /><button onClick={() => void refreshDevices()} disabled={refreshingScanners} aria-label="Refresh scanners"><RefreshCw className={refreshingScanners ? "spin" : ""} /></button></div>
      <div className="settings-block"><h3>Scan settings</h3><div className="setting-fields"><Field label="Scan mode" options={scanOptions.modes} value={scanMode} onChange={setScanMode} /><Field label="Paper size" options={scanOptions.papers} value={paperSize} onChange={setPaperSize} /><Field label="Resolution (detail level)" options={scanOptions.resolutions} value={resolution} onChange={setResolution} /><Field label="File format" options={scanOptions.formats} value={fileFormat} onChange={(value) => { setFileFormat(value); if (value !== "PDF") setDuplex(false); }} /></div></div>
      <div className="settings-block"><h3>Document handling</h3><Switch label="Duplex scanning" description={fileFormat === "PDF" && feeder ? "Save front and back as two PDF pages per sheet" : "Select PDF and the automatic feeder for two-sided scanning"} value={duplex} setValue={setDuplex} disabled={!selectedScanner?.capabilities.supportsDuplex || fileFormat !== "PDF" || !feeder} /><Switch label="Automatic document feeder" description="Scan multiple pages continuously" value={feeder} setValue={(value) => { setFeeder(value); if (!value) setDuplex(false); }} disabled={!!selectedScanner && !selectedScanner.capabilities.sources.includes("flatbed")} /><Switch label="Improve scan quality" description="Automatic image enhancement is not available in this connection" value={enhance} setValue={setEnhance} disabled /></div>
      <SaveSpace value={saveSpace} onChange={setSaveSpace} />
      <ScanOutputControls category={scanCategory} setCategory={setScanCategory} sheetLimit={sheetLimit} setSheetLimit={setSheetLimit} fileFormat={fileFormat} maximum={selectedScanner?.capabilities.maxFeederPages} disabled={scanning} />
      <ScannerDetails scanner={selectedScanner} error={scannerError} reconnect={reconnectScanner} reconnecting={reconnecting} disabled={scanning} />
      <button className="primary start-scan" onClick={() => void scan()} disabled={scanning || selectedScanner?.status !== "ready"}>{scanning ? <><RotateCw className="spin" />{activeJob?.status === "processing" ? "Preparing file" : "Scanning pages"}… {progress}%</> : <><ScanLine />Start Scanning</>}</button>
      {scanning && <div className="scan-progress"><i style={{ width: `${progress}%` }} /></div>}
      {scanning && activeJob && <button className="cancel-scan" onClick={() => void cancelScan().catch((error) => notify(error instanceof Error ? error.message : "Unable to cancel scan"))}>Cancel current scan</button>}
    </section>
    <div className="scan-side-column">
      <section className="panel scan-preview-card"><div className="card-title compact"><div><span className="title-icon violet"><Eye /></span><div><h2>Scanner Status</h2><p>Live job progress from the scanner backend</p></div></div><button className="ghost-small" onClick={() => void refreshDevices()} disabled={refreshingScanners}><RefreshCw className={refreshingScanners ? "spin" : ""} />Refresh</button></div><div className="empty-scanner-preview"><div className="preview-paper back" /><div className="preview-paper"><FileText /><i /><i /><i /><span /></div><div className="feeder-base"><i /></div><strong>{scanning ? `${statusLabel(activeJob?.status ?? "queued")} · ${progress}%` : selectedScanner?.status === "ready" ? "Ready to scan" : selectedScanner?.status === "busy" ? "Scanner busy — please wait" : selectedScanner?.status === "error" ? "Connection check failed — retrying" : "Scanner unavailable"}</strong><span>{selectedScanner?.capabilities.maxFeederPages ? `Up to ${selectedScanner.capabilities.maxFeederPages} sheets can be loaded at once` : "Refresh scanner connection to continue"}</span></div></section>
      <section className="panel queue-card"><div className="card-title compact"><div><h2>Recent Scan Jobs</h2><p>Live scanner history</p></div><button className="bare-link" onClick={() => void refreshJobs()}>Refresh</button></div>{jobs.slice(0, 4).map((job) => <ScanJob key={job.id} name={job.result?.fileName ?? job.settings.fileName} meta={jobMeta(job)} status={statusLabel(job.status)} downloadUrl={job.result?.downloadUrl} />)}{!jobs.length && <div className="scan-queue-empty">No scan jobs yet.</div>}</section>
    </div>
  </div>;
}


function CategoriesPage({ docs, notify }: { docs: DocumentRecord[]; notify: (message: string) => void }) {
  const definitions = [["Invoices", "$", "blue"], ["Contracts", "C", "violet"], ["Reports", "R", "green"], ["Receipts", "R", "orange"], ["Identification", "ID", "cyan"], ["Government", "G", "red"], ["Correspondence", "@", "indigo"], ["Uncategorized", "?", "gray"]] as const;
  const categories = definitions.map(([name, mark, color]) => {
    const categoryDocuments = docs.filter((document) => document.category === name);
    return { name, mark, color, count: categoryDocuments.length, pages: categoryDocuments.reduce((total, document) => total + document.pages, 0) };
  });
  const uncategorized = docs.filter((document) => document.category === "Uncategorized").length;
  return <><div className="category-summary"><SummaryCard icon={<Folder />} label="Total categories" value={String(definitions.length)} color="blue" /><SummaryCard icon={<FileText />} label="Categorized documents" value={String(docs.length - uncategorized)} color="green" /><SummaryCard icon={<CircleAlert />} label="Needs categorization" value={String(uncategorized)} color="orange" /></div><div className="category-grid">{categories.map(({ name, count, mark, color, pages }) => <article className="panel category-card" key={name}><div className="category-card-head"><span className={`category-symbol ${color}`}>{mark}</span></div><h3>{name}</h3><strong>{count} document{count === 1 ? "" : "s"}</strong><div className="category-line"><i style={{ width: `${docs.length ? count / docs.length * 100 : 0}%` }} /></div><span>{pages} document page{pages === 1 ? "" : "s"}</span><Link className="category-open" href={`/all-documents?category=${encodeURIComponent(name)}`}>View documents <ChevronRight /></Link></article>)}</div></>;
}

type LiveUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: UserRole;
  status: "Online" | "Offline";
  lastActiveAt: string | null;
  documentCount: number;
  privateDocumentCount: number;
  publicDocumentCount: number;
  isCurrentUser: boolean;
};

function relativeActivity(timestamp: string | null, now: number) {
  if (!timestamp) return "No recorded activity";
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (elapsedSeconds < 60) return "Just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(timestamp));
}

function UsersPage({ notify }: { notify: (message: string) => void }) {
  const [members, setMembers] = useState<LiveUser[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const notifyRef = useRef(notify);

  useEffect(() => { notifyRef.current = notify; }, [notify]);

  useEffect(() => {
    let active = true;

    const loadUsers = async (background = false) => {
      if (!background) setRefreshing(true);
      try {
        const response = await fetch("/api/users", { cache: "no-store" });
        const result = await response.json() as { users?: LiveUser[]; generatedAt?: string; error?: string };
        if (!response.ok || !result.users) throw new Error(result.error || "Unable to load users");
        if (active) {
          setMembers(result.users);
          setLastUpdatedAt(result.generatedAt ?? new Date().toISOString());
        }
      } catch {
        if (active && !background) notifyRef.current("Unable to refresh live user data");
      } finally {
        if (active) { setLoading(false); setRefreshing(false); }
      }
    };

    void loadUsers();
    const interval = window.setInterval(() => void loadUsers(true), 15_000);
    const onFocus = () => void loadUsers(true);
    const onVisibility = () => { if (document.visibilityState === "visible") void loadUsers(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  const updateRole = async (member: LiveUser, nextRole: UserRole) => {
    if (member.role === nextRole || member.isCurrentUser) return;
    setSavingUserId(member.id);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, role: nextRole }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to update role");
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item));
      notify(`${member.name} is now an ${nextRole}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update user role");
    } finally {
      setSavingUserId(null);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMembers = members.filter((member) => {
    const matchesQuery = !normalizedQuery || `${member.name} ${member.email}`.toLowerCase().includes(normalizedQuery);
    const matchesRole = role === "All roles" || member.role === role;
    const matchesStatus = status === "All statuses" || member.status === status;
    return matchesQuery && matchesRole && matchesStatus;
  });
  const onlineUsers = members.filter((member) => member.status === "Online").length;
  const offlineUsers = members.length - onlineUsers;
  const administrators = members.filter((member) => member.role === "Administrator").length;
  const relativeNow = Date.now();

  return <>
    <div className="user-summary"><SummaryCard icon={<Users />} label="Total users" value={loading ? "—" : String(members.length)} color="blue" /><SummaryCard icon={<Activity />} label="Online now" value={loading ? "—" : String(onlineUsers)} color="green" /><SummaryCard icon={<Clock3 />} label="Offline" value={loading ? "—" : String(offlineUsers)} color="orange" /><SummaryCard icon={<ShieldCheck />} label="Administrators" value={loading ? "—" : String(administrators)} color="violet" /></div>
    <section className="panel users-panel">
      <div className="users-toolbar">
        <label className="small-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users…" aria-label="Search users" /></label>
        <SelectControl value={role} setValue={setRole} values={["All roles", "Administrator", "Editor"]} />
        <SelectControl value={status} setValue={setStatus} values={["All statuses", "Online", "Offline"]} />
        <div className="users-live-state"><i /><span>{lastUpdatedAt ? `Live · Updated ${relativeActivity(lastUpdatedAt, relativeNow)}` : "Connecting to live data…"}</span></div>
        <button type="button" className="audit-refresh" onClick={() => setReload((value) => value + 1)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} />Refresh</button>
      </div>
      <table className="users-table">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Saved documents</th><th>Last activity</th></tr></thead>
        <tbody>
          {loading && !members.length ? <tr><td colSpan={5}><div className="users-loading"><RotateCw className="spin" />Loading live user data…</div></td></tr> : visibleMembers.map((member, index) => <tr key={member.id}>
            <td><div className="member"><span className={`member-avatar a${index}`}>{member.initials}</span><div><strong>{member.name}{member.isCurrentUser ? " (You)" : ""}</strong><span>{member.email}</span></div></div></td>
            <td><Dropdown value={member.role} disabled={savingUserId === member.id || member.isCurrentUser} onChange={(event) => void updateRole(member, event.target.value as UserRole)} aria-label={`Role for ${member.name}`}><option>Administrator</option><option>Editor</option></Dropdown></td>
            <td><span className={`member-status ${member.status.toLowerCase()}`}><i />{member.status}</span></td>
            <td><div className="user-document-count"><strong>{member.documentCount}</strong><small>{member.privateDocumentCount} private · {member.publicDocumentCount} public</small></div></td>
            <td>{relativeActivity(member.lastActiveAt, relativeNow)}</td>
          </tr>)}
          {!loading && !visibleMembers.length && <tr><td colSpan={5}><div className="users-loading">No users match these filters.</div></td></tr>}
        </tbody>
      </table>
      <div className="users-foot"><span>Showing {visibleMembers.length} of {members.length} workspace users</span><span>Online means an active browser within 45 seconds. Refreshes every 15 seconds.</span></div>
    </section>
  </>;
}

function LogsPage({ notify }: { notify: (message: string) => void }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState("all");
  const [action, setAction] = useState<"All activity" | AuditAction>("All activity");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async (background = false) => {
      try {
        const response = await fetch("/api/logs", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load audit logs");
        const result = await response.json() as { logs: AuditLog[] };
        if (active) setLogs(result.logs);
      } catch { if (active && !background) notifyRef.current("Unable to load audit logs"); }
      finally { if (active) setLoading(false); }
    };
    void load();
    const interval = window.setInterval(() => void load(true), 15000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [reload]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleLogs = logs.filter((log) => {
    const matchesUser = selectedUser === "all" || log.userId === selectedUser;
    const matchesAction = action === "All activity" || log.action === action;
    const searchable = `${log.userName} ${log.role} ${log.description} ${log.ipAddress} ${log.device}`.toLowerCase();
    return matchesUser && matchesAction && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const signIns = logs.filter((log) => log.action === "sign-in").length;
  const scans = logs.filter((log) => log.action === "scan").length;
  const fileChanges = logs.filter((log) => log.action.startsWith("file-")).length;
  const activeUsers = new Set(logs.filter(log => log.role !== "System").map((log) => log.userId)).size;
  const actionLabel: Record<AuditAction, string> = { ocr: "Text recognition", "sign-in": "Sign in", "sign-out": "Sign out", scan: "Scan started", "scanner-control": "Scanner connection", "file-uploaded": "File uploaded", "file-scanned": "Scan saved", "file-updated": "File changed", "file-deleted": "Moved to trash" };

  return <>
    <div className="audit-summary"><SummaryCard icon={<Activity />} label="Recorded events" value={String(logs.length)} color="blue" /><SummaryCard icon={<LockKeyhole />} label="Sign-ins" value={String(signIns)} color="green" /><SummaryCard icon={<ScanLine />} label="Scans" value={String(scans)} color="violet" /><SummaryCard icon={<FileText />} label="File activity" value={String(fileChanges)} color="blue" /><SummaryCard icon={<Users />} label="Users tracked" value={String(activeUsers)} color="orange" /></div>
    <section className="panel audit-panel">
      <div className="audit-toolbar">
        <div><h2>Activity history</h2><p>Security and document activity across the DMS workspace</p></div>
        <label className="small-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document, user, or change…" /></label>
        <label className="select-control audit-user-filter"><Dropdown value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} aria-label="Filter logs by user"><option value="all">All users</option>{dmsUsers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Dropdown><ChevronDown /></label>
        <label className="select-control"><Dropdown value={action} onChange={(event) => setAction(event.target.value as typeof action)} aria-label="Filter logs by activity"><option>All activity</option>{Object.entries(actionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Dropdown><ChevronDown /></label>
        <button className="audit-refresh" onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw className={loading ? "spin" : ""} />Refresh</button>
      </div>
      <div className="audit-table"><div className="audit-table-head"><span>User</span><span>Activity</span><span>Details</span><span>Date &amp; time</span><span>Device / IP</span></div>{loading && !logs.length ? <div className="audit-empty"><RotateCw className="spin" />Loading audit activity…</div> : visibleLogs.map((log) => <article className="audit-row" key={log.id}><div className="audit-user"><span>{log.userInitials}</span><div><strong>{log.userName}</strong><small>{log.role}</small></div></div><div><span className={`audit-action ${log.action}`}>{log.action.startsWith("file-") ? <FileText /> : log.action === "scan" ? <ScanLine /> : <LockKeyhole />}{actionLabel[log.action]}</span></div><p>{log.description}</p><time dateTime={log.timestamp}>{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Beirut" }).format(new Date(log.timestamp))}</time><div className="audit-device"><strong>{log.device}</strong><small>{log.ipAddress}</small></div></article>)}{!loading && !visibleLogs.length && <div className="audit-empty">No activity matches your filters.</div>}</div>
      <div className="audit-footer"><span>Showing {visibleLogs.length} of {logs.length} recorded events</span><strong><ShieldCheck />Administrator-only audit trail</strong></div>
    </section>
  </>;
}

function Field({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) { return <label className="form-field"><span>{label}</span><div><Dropdown aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item}>{item}</option>)}</Dropdown><ChevronDown /></div></label> }
function Switch({ label, description, value, setValue, disabled }: { label: string; description: string; value: boolean; setValue: (value: boolean) => void; disabled?: boolean }) { return <button type="button" disabled={disabled} className="setting-switch" onClick={() => setValue(!value)}><div><strong>{label}</strong><span>{description}</span></div><i className={value ? "on" : ""}><b /></i></button> }
function SelectControl({ value, setValue, values }: { value: string; setValue: (value: string) => void; values: string[] }) { return <label className="select-control"><Dropdown aria-label={values[0]} value={value} onChange={(e) => setValue(e.target.value)}>{values.map((item) => <option key={item}>{item}</option>)}</Dropdown><ChevronDown /></label> }
function DocIcon({ type }: { type: "pdf" | "jpg" }) { return <span className={`large-file-icon ${type}`}>{type === "pdf" ? <FileText /> : <FileImage />}<i>{type.toUpperCase()}</i></span> }
function DocStatus({ status }: { status: Status }) { return <span className={`status ${status.toLowerCase()}`}>{status === "Completed" ? <Check /> : status === "Processing" ? <RotateCw /> : <CircleAlert />}{status}</span> }
function Box({ checked, toggle }: { checked: boolean; toggle: (value: boolean) => void }) { return <button className={`checkbox ${checked ? "checked" : ""}`} onClick={() => toggle(!checked)}>{checked && <Check />}</button> }
function ScanJob({ name, meta, status, downloadUrl }: { name: string; meta: string; status: string; downloadUrl?: string }) { return <div className="scan-job"><span className="job-icon"><FileText /></span><div><strong>{name}</strong><span>{meta}</span></div>{downloadUrl && <a className="scan-job-download" href={downloadUrl} download={name} aria-label={`Download ${name}`}><Download /></a>}<b className={status === "Completed" ? "done" : status === "Failed" || status === "Cancelled" ? "failed" : "working"}>{status === "Completed" ? <Check /> : status === "Failed" || status === "Cancelled" ? <CircleAlert /> : <RotateCw />}{status}</b></div> }
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) { return <div className="panel summary-card"><span className={`summary-icon ${color}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div> }
function FilterGroup({ title, items }: { title: string; items: string[] }) { return <div className="filter-group"><strong>{title}</strong>{items.map((item, index) => <label key={item}><input type="checkbox" defaultChecked={index === 0} /><span>{item}</span></label>)}</div> }
