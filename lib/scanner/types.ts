export type ScannerProviderKind = "bridge";
export type ScannerConnectionStatus = "ready" | "busy" | "offline" | "error";
export type ScanJobStatus = "queued" | "scanning" | "processing" | "completed" | "failed" | "cancelled";
export type ScanSource = "automatic-feeder" | "flatbed";
export type ScanColorMode = "color" | "grayscale" | "black-white";
export type ScanPaperSize = "A4" | "Letter" | "Legal" | "Auto";
export type ScanFileFormat = "searchable-pdf" | "pdf" | "jpeg" | "png";

export type ScannerCapabilities = {
  sources: ScanSource[];
  colorModes: ScanColorMode[];
  paperSizes: ScanPaperSize[];
  resolutions: number[];
  formats: ScanFileFormat[];
  supportsDuplex: boolean;
  supportsAutoFeed: boolean;
  maxFeederPages: number;
};

export type ScannerDevice = {
  feederStatus?: "loaded" | "empty" | "jammed" | "cover-open" | "unknown";
  driverVersion?: string;
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  connection: string;
  status: ScannerConnectionStatus;
  provider: ScannerProviderKind;
  capabilities: ScannerCapabilities;
  lastSeenAt: string;
};

export type ScanSettings = {
  category?: string;
  visibility?: "private" | "public";
  source: ScanSource;
  colorMode: ScanColorMode;
  paperSize: ScanPaperSize;
  resolution: number;
  format: ScanFileFormat;
  duplex: boolean;
  autoFeed: boolean;
  enhance: boolean;
  pageLimit: number;
  fileName: string;
};

export type ScanResult = {
  documentId?: number;
  fileName: string;
  mimeType: string;
  pageCount: number;
  sizeBytes: number;
  downloadUrl: string;
};

export type ScanJob = {
  id: string;
  userId: string;
  scannerId: string;
  scannerName: string;
  provider: ScannerProviderKind;
  providerJobId?: string;
  status: ScanJobStatus;
  progress: number;
  settings: ScanSettings;
  createdAt: string;
  updatedAt: string;
  result?: ScanResult;
  error?: string;
  sourceFileUrl?: string;
};

export type PublicScanJob = Omit<ScanJob, "userId" | "providerJobId" | "sourceFileUrl">;

export type BridgeScanUpdate = {
  jobId: string;
  status: ScanJobStatus;
  progress: number;
  pageCount?: number;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  fileUrl?: string;
  error?: string;
};
