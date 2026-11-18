/**
 * Human-searchable filenames for exported documents.
 *
 * Pattern:  `QT_QT-2026-0001_2026-08-13_ชื่อหน่วยงาน.pdf`
 *           code  docNo         date        org/customer
 *
 * The short code (QT / DO / INV / RC / TX) is what people scan for in a
 * Files/Drive folder, the document number keeps it unique, the date sorts
 * chronologically inside a customer folder, and the org name says who it is
 * for without opening the file.
 */

export const DOC_CODE: Record<string, string> = {
  quotation: "QT",
  delivery: "DO",
  invoice: "INV",
  receipt: "RC",
  tax_invoice: "TX",
  tax_receipt: "TX",
  job_order: "JOB",
  purchase_order: "PO",
};

/** Strip characters that break file systems / cloud sync, keep Thai text. */
export function sanitizeFilePart(s: string, max = 40): string {
  const cleaned = (s || "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned;
}

function isoDate(d?: string | Date | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export interface DocFilenameInput {
  document_type?: string | null;
  document_no?: string | null;
  document_date?: string | Date | null;
  /** Customer / organisation the document is issued to. */
  customer_name?: string | null;
  /** Fallback org name (e.g. the shop) when there is no customer. */
  org_name?: string | null;
}

/** `QT_QT-2026-0001_2026-08-13_ชื่อหน่วยงาน.pdf` */
export function buildDocFilename(doc: DocFilenameInput, ext = "pdf"): string {
  const code = DOC_CODE[String(doc.document_type ?? "")] ?? "DOC";
  const no = sanitizeFilePart(String(doc.document_no ?? "DRAFT"), 30) || "DRAFT";
  const date = isoDate(doc.document_date);
  const org = sanitizeFilePart(String(doc.customer_name || doc.org_name || ""));
  const parts = [code, no, date, org].filter(Boolean);
  return `${parts.join("_")}.${ext}`;
}

/** Name for a bundle (zip / merged pdf) of several documents. */
export function buildBundleFilename(docs: DocFilenameInput[], ext: "zip" | "pdf"): string {
  const date = new Date().toISOString().slice(0, 10);
  const codes = Array.from(new Set(docs.map((d) => DOC_CODE[String(d.document_type ?? "")] ?? "DOC")));
  const codePart = codes.length === 1 ? codes[0] : "DOCS";
  const orgs = Array.from(new Set(docs.map((d) => sanitizeFilePart(String(d.customer_name ?? ""))).filter(Boolean)));
  const orgPart = orgs.length === 1 ? orgs[0] : "";
  const parts = [codePart, date, `${docs.length}ฉบับ`, orgPart].filter(Boolean);
  return `${parts.join("_")}.${ext}`;
}
