"use client";

import Dropdown from "@/components/dropdown";
import DocumentDate from "@/components/document-date";
import TabContent from "@/components/document-detail-tabs";
import { searchableDocumentText, matchesDocumentQuery } from "@/lib/document-text";
import {
  Save,
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
  Copy,
  Database,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  Gauge,
  HardDrive,
  Home,
  Image as ImageIcon,
  ListFilter,
  Maximize2,
  Menu,
  MoreVertical,
  MoveRight,
  Plus,
  RotateCw,
  ScanLine,
  Search,
  Settings,
  Share2,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getDocumentMetrics, type DocumentData } from "@/data/documents";
import { documentCategories } from "@/data/categories";
import { useSession } from "@/lib/use-session";
import { createScanSettings, useScannerBackend, scannerOptions, readScanDefaults } from "@/lib/use-scanner-backend";
import { useDocuments, patchDocument } from "@/lib/use-documents";
import { SaveSpace, DocumentSpaceFilters, DocumentAccess, DocumentUploadButton, useDocumentScope } from "@/components/document-spaces";
import { ScannerDetails, ScanOutputControls } from "@/components/scanner-controls";

type DocStatus = DocumentData["status"];
type DocumentItem = DocumentData;

const navItems = [
  ["Dashboard", Home, "/"],
  ["Scan Documents", ScanLine, "/scan-documents"],
  ["All Documents", FileArchive, "/all-documents"],
  ["Categories", Folder, "/categories"],
  ["Users", Users, "/users"],
  ["Statistics", BarChart3, "/statistics"],
  ["Audit Logs", Activity, "/logs"],
  ["Settings", Settings, "/settings"],
] as const;

const categories = ["All Categories", ...documentCategories];
const CNRS_LOGO_URL = "https://pbs.twimg.com/profile_images/1914297483871551488/QOWuSKqc.jpg";

function documentDateToIso(value: string) {
  const [day, month, year] = value.split(" ");
  const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  return day && months[month] && year ? `${year}-${months[month]}-${day.padStart(2, "0")}` : "";
}

function localDateToIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function friendlyDateRange(from: string, to: string) {
  if (!from && !to) return "All dates";
  const format = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  if (from && to) return from === to ? format(from) : `${format(from)} – ${format(to)}`;
  return from ? `From ${format(from)}` : `Until ${format(to)}`;
}

export default function Dashboard() {
  const { documents: allDocuments, refresh: refreshDocuments, error: documentsError } = useDocuments();
  const [saveSpace, setSaveSpace] = useState<"private" | "public">("private");
  const [scanCategory, setScanCategory] = useState("Uncategorized");
  const [sheetLimit, setSheetLimit] = useState(1);
  const [selectedId, setSelectedId] = useState(1);
  const [selectedRows, setSelectedRows] = useState<number[]>([1]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [status, setStatus] = useState("All Statuses");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Preview");
  const [duplex, setDuplex] = useState(true);
  const [feeder, setFeeder] = useState(true);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [scanMode, setScanMode] = useState("Color");
  const [paperSize, setPaperSize] = useState("A4");
  const [resolution, setResolution] = useState("300 dpi");
  const [fileFormat, setFileFormat] = useState("Searchable PDF");
  const [rowMenu, setRowMenu] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategory, setMoveCategory] = useState("Invoices");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const handledScanJobs = useRef(new Set<string>());
  const defaultsApplied = useRef(false);
  const { user, signOut } = useSession();
  const documentScope = useDocumentScope(allDocuments, user);
  const documents = documentScope.filtered.filter(document => document.category !== "Trash");
  const canManageWorkspace = user?.role === "Administrator";
  const {
    scanners,
    selectedScannerId,
    setSelectedScannerId,
    selectedScanner,
    jobs,
    activeJob,
    loadingScanners,
    refreshingScanners: isRefreshingScanner,
    refreshScanners,
    startScan,
    cancelScan,
    starting,
    error: scannerError,
    reconnectScanner,
    reconnecting,
  } = useScannerBackend();
  const isScanning = starting || Boolean(activeJob && !["completed", "failed", "cancelled"].includes(activeJob.status));
  const lastScan = activeJob ?? jobs[0];
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
      if (profile.scanCategory && documentCategories.some((name) => name === profile.scanCategory)) setScanCategory(profile.scanCategory);
      if (profile.saveSpace === "private" || profile.saveSpace === "public") setSaveSpace(profile.saveSpace);
    }
    setScanMode((value) => options.modes.includes(value) ? value : options.modes[0]);
    setPaperSize((value) => options.papers.includes(value) ? value : options.papers[0]);
    setResolution((value) => options.resolutions.includes(value) ? value : options.resolutions[0]);
    setFileFormat((value) => options.formats.includes(value) ? value : options.formats[0]);
    if (!selectedScanner.capabilities.supportsDuplex) setDuplex(false);
    if (!selectedScanner.capabilities.sources.includes("flatbed")) setFeeder(true);
  }, [selectedScanner]);
  useEffect(() => { setPage(1); }, [documentScope.scope, documentScope.owner]);

  const visibleDocs = useMemo(() => {
    const query = search.toLowerCase();
    return documents.filter((doc) => {
      const matchesQuery = matchesDocumentQuery([doc.documentNumber, doc.name, doc.category, searchableDocumentText(doc), ...doc.tags].join(" "), query);
      const matchesCategory = category === "All Categories" || doc.category === category;
      const matchesStatus = status === "All Statuses" || doc.status === status;
      const documentDate = documentDateToIso(doc.date);
      const matchesStartDate = !dateFrom || documentDate >= dateFrom;
      const matchesEndDate = !dateTo || documentDate <= dateTo;
      return matchesQuery && matchesCategory && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [documents, search, category, status, dateFrom, dateTo]);

  const currentDoc = documents.find((doc) => doc.id === selectedId) ?? documents[0];
  const metrics = useMemo(() => getDocumentMetrics(allDocuments), [allDocuments]);
  const todayLabel = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const scannedToday = allDocuments.filter((document) => document.date === todayLabel).length;
  const storagePercent = metrics.storageMb / (1024 * 1024) * 100;
  const storagePercentLabel = storagePercent < 0.01 ? "<0.01%" : `${storagePercent.toFixed(2)}%`;
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(visibleDocs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedDocs = visibleDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const applyDatePreset = (preset: "all" | "today" | "7-days" | "30-days" | "month") => {
    const today = new Date();
    let from = "";
    let to = "";
    if (preset !== "all") {
      const start = new Date(today);
      if (preset === "7-days") start.setDate(today.getDate() - 6);
      if (preset === "30-days") start.setDate(today.getDate() - 29);
      if (preset === "month") start.setDate(1);
      const end = preset === "month" ? new Date(today.getFullYear(), today.getMonth() + 1, 0) : today;
      from = localDateToIso(start);
      to = localDateToIso(end);
    }
    setDateFrom(from);
    setDateTo(to);
    setDraftDateFrom(from);
    setDraftDateTo(to);
    setPage(1);
    setDateFilterOpen(false);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const runScan = async () => {
    if (isScanning) return;
    try {
      await startScan(createScanSettings({ scanMode, paperSize, resolution, fileFormat, duplex, feeder, visibility: saveSpace, category: scanCategory, sheetLimit }));
      showToast("Scan started on the connected scanner");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to start the scanner");
    }
  };


  const deleteCurrent = async () => {
    if (!currentDoc) return;
    try { await patchDocument(currentDoc.id, { deleted: true }); await refreshDocuments(); showToast("Document moved to trash"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to move document to trash"); }
  };

  const saveScanProfile = () => {
    window.localStorage.setItem("docscan-profile", JSON.stringify({ scanMode, paperSize, resolution, fileFormat, duplex, feeder, sheetLimit, scanCategory, saveSpace }));
    showToast("Scan profile saved in this browser");
  };

  const clearScanner = () => {
    setScanMode(scanOptions.modes[0]); setPaperSize(scanOptions.papers[0]); setResolution(scanOptions.resolutions[0]); setFileFormat(scanOptions.formats[0]);
    setDuplex(selectedScanner?.capabilities.supportsDuplex ?? false); setFeeder(true);
    showToast("Scanner settings reset");
  };

  const shareCurrent = async () => {
    if (!currentDoc) return;
    const url = `${window.location.origin}${currentDoc.downloadUrl || "/"}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Document link copied to clipboard");
    } catch {
      showToast("Clipboard access is unavailable in this browser");
    }
  };

  const moveCurrent = async () => {
    if (!currentDoc) return;
    try { await patchDocument(currentDoc.id, { category: moveCategory }); await refreshDocuments(); setMoveOpen(false); showToast(`Document moved to ${moveCategory}`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to move document"); }
  };

  const refreshScanner = async () => {
    if (isRefreshingScanner) return;
    try {
      const discovered = await refreshScanners();
      showToast(discovered.length ? `${discovered.length} scanner${discovered.length === 1 ? "" : "s"} found` : "No scanner was found");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to refresh scanners");
    }
  };

  useEffect(() => {
    if (!activeJob || handledScanJobs.current.has(activeJob.id)) return;
    if (activeJob.status === "completed" && activeJob.result) {
      handledScanJobs.current.add(activeJob.id);
      const result = activeJob.result;
      void refreshDocuments();
      if (result.documentId) {
        setSelectedId(result.documentId); setSelectedRows([result.documentId]);
        setSearch(""); setCategory("All Categories"); setStatus("All Statuses");
        setDateFrom(""); setDateTo(""); setPage(1);
        documentScope.setScope("all"); documentScope.setOwner("all");
      }
      showToast(`${result.pageCount} page${result.pageCount === 1 ? "" : "s"} scanned successfully`);
    } else if (activeJob.status === "failed" || activeJob.status === "cancelled") {
      handledScanJobs.current.add(activeJob.id);
      showToast(activeJob.error || (activeJob.status === "cancelled" ? "Scan cancelled" : "The scanner could not finish the job"));
    }
  }, [activeJob, refreshDocuments]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark cnrs-brand-mark"><img src={CNRS_LOGO_URL} alt="CNRS-L logo" /></div>
          <div><strong>DMS</strong><span>CNRS document management System</span></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
        </div>
        <nav>
          {navItems.filter(([, , href]) => canManageWorkspace || !["/users", "/statistics", "/logs", "/settings"].includes(href)).map(([label, Icon, href], index) => (
            <Link className={index === 0 ? "nav-item active" : "nav-item"} href={href} key={label} onClick={() => setMobileNav(false)}>
              <Icon size={19} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="storage-meter">
          <span>Storage Usage</span>
          
          <small>{metrics.storageMb.toFixed(2)} MB in accessible files</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button>
          <label className="global-search"><Search size={19} /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, number, or document text…" aria-label="Search documents" /></label>
          <div className="profile-area">
            <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}><div className="avatar">{user?.initials ?? "--"}</div><div className="profile-copy"><strong>{user?.name ?? "Loading…"}</strong><span>{user?.role ?? ""}</span></div><ChevronDown size={17} /></button>
            {profileOpen && <div className="header-popover profile-popover"><p>{user?.name}<br />{user?.email}<br />{user?.role}</p>{canManageWorkspace && <Link href="/settings"><Settings />Workspace settings</Link>}<button onClick={signOut}><X />Sign out</button></div>}
          </div>
        </header>

        <div className="workspace">
          {documentsError && <p role="alert">{documentsError}</p>}
          <section className="stats-grid">
            <Stat icon={<FileText />} tone="blue" label="Total Documents" value={String(metrics.totalDocuments)} trend={String(metrics.totalPages)} note="document pages" />
            <Stat icon={<ScanLine />} tone="blue" label="Added Today" value={String(scannedToday)} note="scanned or uploaded" />
            <Stat icon={<ScanLine />} tone="violet" label="Text Recognized" value={String(metrics.completed)} trend={`${metrics.totalDocuments ? Math.round(metrics.completed / metrics.totalDocuments * 100) : 0}%`} note="completion rate" />
            <Stat icon={<Clock3 />} tone="orange" label="Waiting for Text" value={String(metrics.processing)} note={`${metrics.failed} failed`} />
            <Stat icon={<Database />} tone="green" label="Storage Used" value={`${metrics.storageMb.toFixed(1)} MB`} note="accessible document files" />
          </section>

          <div className="main-grid">
            <section className="scan-card panel">
              <header className="scan-card-heading">
                <span className="scan-card-icon" aria-hidden="true"><ScanLine size={23} /></span>
                <div><h2>Scan Document</h2><p>Choose your settings and save location.</p></div>
              </header>

              <fieldset className="scan-card-section">
                <legend>Scanner</legend>
                <div className={`scan-device-status ${selectedScanner?.status === "ready" ? "ready" : "unavailable"}`} role="status">
                  <i aria-hidden="true" />
                  {isRefreshingScanner ? "Checking connection…" : isScanning ? "Scan in progress" : selectedScanner?.status === "ready" ? "Connected and ready" : selectedScanner?.status === "busy" ? "Scanner busy — please wait" : selectedScanner?.status === "error" ? "Connection check failed — retrying" : "No scanner connected"}
                </div>
                <div className="device-row">
                  <label className="select-box"><ScanLine size={18} /><Dropdown value={selectedScannerId} onChange={(event) => setSelectedScannerId(event.target.value)} disabled={isScanning || loadingScanners} aria-label="Select scanner">{!scanners.length && <option value="">Select a scanner</option>}{scanners.map((scanner) => <option key={scanner.id} value={scanner.id}>{scanner.name}</option>)}</Dropdown><ChevronDown size={16} /></label>
                  <button type="button" className="square-button" onClick={() => void refreshScanner()} disabled={isRefreshingScanner || isScanning} title="Refresh scanner connection" aria-label="Refresh scanner connection"><RotateCw className={isRefreshingScanner ? "spin" : ""} size={18} /></button>
                </div>
                {!selectedScanner && !loadingScanners && <p className="scan-section-hint">Connect your scanner, then refresh the connection.</p>}
              </fieldset>

              <ScannerDetails scanner={selectedScanner} error={scannerError} reconnect={reconnectScanner} reconnecting={reconnecting} disabled={isScanning} />

              <fieldset className="scan-card-section" disabled={isScanning}>
                <legend>Scan settings</legend>
                <div className="field-grid">
                  <SelectField label="Color mode" options={scanOptions.modes} value={scanMode} onChange={setScanMode} />
                  <SelectField label="Paper size" options={scanOptions.papers} value={paperSize} onChange={setPaperSize} />
                  <SelectField label="Resolution" options={scanOptions.resolutions} value={resolution} onChange={setResolution} />
                  <SelectField label="File format" options={scanOptions.formats} value={fileFormat} onChange={(value) => { setFileFormat(value); if (value !== "PDF") setDuplex(false); }} />
                </div>
              </fieldset>

              <fieldset className="scan-card-section" disabled={isScanning}>
                <legend>Paper handling</legend>
                <Toggle label="Scan both sides" description={!selectedScanner?.capabilities.supportsDuplex ? "Not available with this scanner connection." : fileFormat !== "PDF" || !feeder ? "Select PDF and the automatic feeder to scan both sides." : "Save the front and back of each sheet as two PDF pages."} disabled={!selectedScanner?.capabilities.supportsDuplex || fileFormat !== "PDF" || !feeder} checked={duplex} onChange={setDuplex} />
                <Toggle label="Automatic feeder" description="Scan a stack of pages in one job." disabled={!!selectedScanner && !selectedScanner.capabilities.sources.includes("flatbed")} checked={feeder} onChange={(value) => { setFeeder(value); if (!value) setDuplex(false); }} />
              </fieldset>

              <fieldset className="scan-card-section scan-save-section" disabled={isScanning}>
                <legend>Save location</legend>
                <SaveSpace label="Document space" value={saveSpace} onChange={setSaveSpace} />
                <ScanOutputControls category={scanCategory} setCategory={setScanCategory} sheetLimit={sheetLimit} setSheetLimit={setSheetLimit} fileFormat={fileFormat} maximum={selectedScanner?.capabilities.maxFeederPages} disabled={isScanning} />
              </fieldset>
              <button type="button" className="primary scan-button" onClick={() => void runScan()} disabled={isScanning || selectedScanner?.status !== "ready"} aria-describedby="scan-availability-hint">
                {isScanning ? <><RotateCw className="spin" size={20} /> {activeJob?.status === "processing" ? "Preparing file" : "Scanning"}… {activeJob?.progress ?? 0}%</> : <><ScanLine size={20} />Start scan</>}
              </button>
              <p id="scan-availability-hint" className="scan-start-hint">{isScanning ? "Please wait while your document is captured and saved." : selectedScanner?.status === "ready" ? "Place your documents in the scanner before starting." : "Scanning will be available once a scanner is connected."}</p>
              {isScanning && <div className="scan-progress" role="progressbar" aria-label="Scan progress" aria-valuenow={activeJob?.progress ?? 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${activeJob?.progress ?? 0}%` }} /></div>}
              {isScanning && activeJob && <button type="button" className="cancel-scan" onClick={() => void cancelScan().catch((error) => showToast(error instanceof Error ? error.message : "Unable to cancel scan"))}>Cancel current scan</button>}
              {lastScan?.status === "failed" && <p className="scan-failure-message" role="alert"><strong>Scan was not saved.</strong> {lastScan.error || "The scanner could not finish this job."}</p>}

              <div className="scan-actions">
                <button type="button" disabled={!currentDoc} onClick={() => { setActiveTab("Preview"); previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Eye size={17} />Preview document</button>
                <button type="button" disabled={isScanning} onClick={saveScanProfile}><Save size={17} />Save settings</button>
                <button type="button" disabled={isScanning} onClick={clearScanner}><RotateCw size={17} />Reset settings</button>
              </div>

              <details className="scan-illustration">
                <summary>Scanner illustration</summary>
                <div className="scanner-stage" aria-hidden="true">
                  <div className="paper loaded-paper"><b>QUARTERLY REPORT</b><i /><i /><i /><div className="mini-chart"><span /><span /><span /><span /></div></div>
                  <div className="scanner-machine">
                    <div className="scanner-top"><span /></div>
                    <div className="scanner-body"><b>DMS</b><i /><em /></div>
                    <div className="output-paper"><i /><i /><i /><i /></div>
                    <div className="scanner-foot left" /><div className="scanner-foot right" />
                  </div>
                </div>
              </details>
            </section>

            <section className="content-stack">
              <div className={`documents-panel panel ${dateFilterOpen ? "filter-open" : ""}`}>
                <DocumentSpaceFilters documents={allDocuments} user={user} selection={documentScope} />
                <div className="documents-toolbar">
                  <h2>Documents</h2>
                  <div className="filters">
                    <label><ListFilter size={15} /><Dropdown aria-label="Filter by category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>{categories.map((item) => <option key={item}>{item}</option>)}</Dropdown><ChevronDown size={15} /></label>
                    <label><Dropdown aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option>All Statuses</option><option>Completed</option><option>Not processed</option><option>Failed</option></Dropdown><ChevronDown size={15} /></label>
                    <div className="date-filter-wrap">
                      <button type="button" className={`date-filter ${dateFilterOpen ? "open" : ""}`} onClick={() => { setDraftDateFrom(dateFrom); setDraftDateTo(dateTo); setDateFilterOpen((open) => !open); }} aria-expanded={dateFilterOpen} aria-haspopup="dialog"><CalendarDays size={17} /><span className="date-filter-label">{friendlyDateRange(dateFrom, dateTo)}</span>{(dateFrom || dateTo) && <i className="active-filter-dot" />}<ChevronDown size={15} /></button>
                      {dateFilterOpen && <div className="date-filter-popover" role="dialog" aria-label="Choose a document date range"><div className="date-popover-heading"><div><strong>Filter by date</strong><span>Choose a quick range or enter custom dates.</span></div><button type="button" onClick={() => setDateFilterOpen(false)} aria-label="Close date filter"><X /></button></div><div className="date-presets"><button type="button" className={!dateFrom && !dateTo ? "active" : ""} onClick={() => applyDatePreset("all")}>All dates</button><button type="button" onClick={() => applyDatePreset("today")}>Today</button><button type="button" onClick={() => applyDatePreset("7-days")}>Last 7 days</button><button type="button" onClick={() => applyDatePreset("30-days")}>Last 30 days</button><button type="button" onClick={() => applyDatePreset("month")}>This month</button></div><span className="custom-range-label">Custom range</span><div className="date-fields"><label><span>From</span><input type="date" value={draftDateFrom} max={draftDateTo || undefined} onChange={(event) => setDraftDateFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={draftDateTo} min={draftDateFrom || undefined} onChange={(event) => setDraftDateTo(event.target.value)} /></label></div><div className="date-filter-actions"><button type="button" onClick={() => { setDraftDateFrom(""); setDraftDateTo(""); }}>Clear</button><button type="button" className="primary" disabled={Boolean(draftDateFrom && draftDateTo && draftDateFrom > draftDateTo)} onClick={() => { setDateFrom(draftDateFrom); setDateTo(draftDateTo); setPage(1); setDateFilterOpen(false); }}>Apply range</button></div></div>}
                    </div>
                    <DocumentUploadButton notify={showToast} />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th className="check-col"><CheckBox checked={pagedDocs.length > 0 && pagedDocs.every((d) => selectedRows.includes(d.id))} onChange={(checked) => setSelectedRows(checked ? pagedDocs.map((d) => d.id) : [])} /></th><th>Document Number</th><th>Name</th><th>Category</th><th>Date &amp; time</th><th>Pages</th><th>Text Recognition</th><th /></tr></thead>
                    <tbody>
                      {pagedDocs.map((doc) => (
                        <tr key={doc.id} className={selectedId === doc.id ? "selected" : ""} onClick={() => { setSelectedId(doc.id); setSelectedRows([doc.id]); }}>
                          <td onClick={(e) => e.stopPropagation()}><CheckBox checked={selectedRows.includes(doc.id)} onChange={(checked) => setSelectedRows((rows) => checked ? [...new Set([...rows, doc.id])] : rows.filter((id) => id !== doc.id))} /></td>
                          <td><b className="document-number">{doc.documentNumber}</b></td><td><div className="filename"><FileBadge type={doc.type} /><span>{doc.name}</span></div><DocumentAccess document={doc} user={user} notify={showToast} /></td>
                          <td className="muted">{doc.category}</td><td className="muted"><DocumentDate createdAt={doc.createdAt} fallback={doc.date} /></td><td>{doc.pages}</td><td><StatusBadge status={doc.status} /></td>
                          <td className="row-menu-cell"><button className="bare-button" onClick={(e) => { e.stopPropagation(); setRowMenu(rowMenu === doc.id ? null : doc.id); }}><MoreVertical size={17} /></button>{rowMenu === doc.id && <div className="row-menu" onClick={(e) => e.stopPropagation()}><button onClick={() => { setSelectedId(doc.id); setActiveTab("Preview"); setRowMenu(null); previewRef.current?.scrollIntoView({ behavior: "smooth" }); }}><Eye />Preview</button>{doc.downloadUrl && <a href={doc.downloadUrl} download={doc.name}><Download />Download</a>}</div>}</td>
                        </tr>
                      ))}
                      {!visibleDocs.length && <tr><td colSpan={8} className="empty-state">No documents match your filters.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Showing {visibleDocs.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visibleDocs.length)} of {visibleDocs.length} documents</span><div className="pagination"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /></button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button key={number} className={number === currentPage ? "active" : ""} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight /></button></div></div>
              </div>

              {currentDoc && <div className="preview-panel panel" ref={previewRef}>
                <div className="preview-titlebar">
                  <div className="selected-file"><FileBadge type={currentDoc.type} /><strong>{currentDoc.name}</strong></div>
                  <div className="file-actions">
                    {currentDoc.downloadUrl ? <a className="primary download-action" href={currentDoc.downloadUrl} download={currentDoc.name} onClick={() => showToast("Download started")}><Download size={17} />Download<ChevronDown size={14} /></a> : <button className="primary" onClick={() => showToast("This new file is still processing")}><Download size={17} />Download<ChevronDown size={14} /></button>}
                    <button onClick={shareCurrent}><Share2 size={17} />Share</button>
                    <button onClick={() => { setMoveCategory(currentDoc.category); setMoveOpen(true); }}><FolderInput size={17} />Move</button>
                    <button className="danger" onClick={deleteCurrent}><Trash2 size={17} />Delete</button>
                  </div>
                </div>
                <div className="tabs">
                  {["Preview", "Extracted Text", "Document Details", "Pages", "History"].map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
                </div>
                {activeTab === "Preview" ? <PreviewWorkspace doc={currentDoc} notify={showToast} /> : <TabContent tab={activeTab} doc={currentDoc} user={user} />}
              </div>}
            </section>
          </div>
        </div>
      </main>
      {moveOpen && currentDoc && <div className="modal-backdrop" onMouseDown={() => setMoveOpen(false)}><div className="move-modal" onMouseDown={(e) => e.stopPropagation()}><div><FolderInput /><h3>Move document</h3><button onClick={() => setMoveOpen(false)}><X /></button></div><p>Choose a new category for <strong>{currentDoc.name}</strong>.</p><label>Destination<Dropdown aria-label="Destination category" value={moveCategory} onChange={(e) => setMoveCategory(e.target.value)}>{categories.filter((item) => item !== "All Categories").map((item) => <option key={item}>{item}</option>)}</Dropdown></label><div className="modal-actions"><button onClick={() => setMoveOpen(false)}>Cancel</button><button className="primary" onClick={moveCurrent}>Move document</button></div></div></div>}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function Stat({ icon, tone, label, value, trend, note }: { icon: React.ReactNode; tone: string; label: string; value: string; trend?: string; note?: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong>{(trend || note) && <small>{trend && <b>{trend}</b>} {note}</small>}</div></div>;
}

function SelectField({ label, options, value, onChange }: { label: string; options: string[]; value?: string; onChange?: (value: string) => void }) {
  return <label className="form-field"><span>{label}</span><div><Dropdown aria-label={label} value={value} onChange={(event) => onChange?.(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</Dropdown><ChevronDown size={15} /></div></label>;
}

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" disabled={disabled} aria-checked={checked} aria-label={label} className="toggle-row" onClick={() => onChange(!checked)}>
    <span className="scan-toggle-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <span className={`toggle ${checked ? "on" : ""}`} aria-hidden="true"><i /></span>
  </button>;
}

function CheckBox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button aria-label="Select row" className={`checkbox ${checked ? "checked" : ""}`} onClick={() => onChange(!checked)}>{checked && <Check size={12} strokeWidth={4} />}</button>;
}

function FileBadge({ type }: { type: "pdf" | "jpg" }) {
  return <span className={`file-badge ${type}`}>{type === "pdf" ? <><FileText size={20} /><i>PDF</i></> : <><FileImage size={20} /><i>JPG</i></>}</span>;
}

function StatusBadge({ status }: { status: DocStatus }) {
  return <span className={`status ${status.toLowerCase()}`}>{status === "Completed" ? <Check size={13} /> : status === "Processing" ? <RotateCw size={13} /> : <CircleAlert size={13} />}{status}</span>;
}

function PreviewWorkspace({ doc }: { doc: DocumentItem; notify: (message: string) => void }) {
  return <div className="preview-workspace" style={{ display: "block" }}>
    {doc.type === "pdf" ? <iframe title={`Preview ${doc.name}`} src={`${doc.downloadUrl}?preview=1`} style={{ width: "100%", height: "100%", border: 0 }} /> : <img alt={doc.name} src={`${doc.downloadUrl}?preview=1`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
  </div>;
}
