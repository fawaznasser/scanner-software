import type { UserRole } from "@/data/users";

export type AuditAction = "sign-in" | "sign-out" | "scan" | "file-uploaded" | "file-scanned" | "file-updated" | "file-deleted" | "scanner-control" | "ocr";

export type FileAuditDetails = {
  documentId: number;
  documentNumber: string;
  documentName: string;
  ownerId: string;
  changes?: { field: string; before: string; after: string }[];
};

export type AuditLog = {
  id: string;
  userId: string;
  userName: string;
  userInitials: string;
  role: UserRole | "System";
  action: AuditAction;
  description: string;
  timestamp: string;
  ipAddress: string;
  device: string;
  userAgent?: string;
  file?: FileAuditDetails;
};

