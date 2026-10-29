export const documentCategories = [
  "Invoices", "Contracts", "Identification", "Reports", "Receipts",
  "Government", "Correspondence", "Uncategorized",
] as const;

export function parseDocumentCategory(value: unknown): string {
  if (value === undefined || value === null) return "Uncategorized";
  if (typeof value !== "string" || !documentCategories.some((category) => category === value)) {
    throw new Error("Choose a valid document category.");
  }
  return value;
}
