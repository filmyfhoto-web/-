/**
 * Excel intake — ลูกค้าส่ง "ไฟล์ Excel เดิมของตัวเอง" (.xlsx/.xls/.csv)
 * แล้วระบบแปลงเป็นรายการสินค้า โดย reuse parser ของ Smart Import เดิม
 */
import { parseSmartImport, type SmartImportRow } from "@/lib/smartImport";

export const EXCEL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const EXCEL_BUCKET = "customer-uploads"; // private bucket เท่านั้น
export const EXCEL_ACCEPT = ".xlsx,.xls,.csv,text/csv";

const EXT_RE = /\.(xlsx|xlsm|xls|csv)$/i;

/** mime ที่ยอมรับ (บางเบราว์เซอร์ส่งค่าว่างมา ถือว่าผ่านแล้วใช้นามสกุลตัดสิน) */
const MIME_OK = new Set([
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/octet-stream",
]);

/** ชื่อไฟล์ที่ปลอดภัยสำหรับ storage key (กัน path traversal / อักขระแปลก) */
export function sanitizeFilename(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return cleaned || "upload.xlsx";
}

/** path ในบัคเก็ตส่วนตัว: <uid>/excel-intake/<intakeId>/<ชื่อไฟล์> (RLS ใช้โฟลเดอร์แรก) */
export function excelStoragePath(userId: string, intakeId: string, filename: string): string {
  return `${userId}/excel-intake/${intakeId}/${sanitizeFilename(filename)}`;
}

export interface ExcelFileCheck {
  ok: boolean;
  reason?: string;
  kind?: "excel" | "csv";
}

export function checkExcelFile(file: { name: string; size: number; type?: string }): ExcelFileCheck {
  if (!EXT_RE.test(file.name)) {
    return { ok: false, reason: "รองรับเฉพาะไฟล์ .xlsx, .xls หรือ .csv" };
  }
  if (file.size <= 0) return { ok: false, reason: "ไฟล์ว่าง" };
  if (!MIME_OK.has(String((file as { type?: string }).type ?? ""))) {
    return { ok: false, reason: "ชนิดไฟล์ไม่รองรับ" };
  }
  if (file.size > EXCEL_MAX_BYTES) {
    return { ok: false, reason: "ไฟล์ใหญ่เกิน 10 MB — กรุณาแบ่งไฟล์" };
  }
  return { ok: true, kind: /\.csv$/i.test(file.name) ? "csv" : "excel" };
}

/** ป้องกัน formula injection ตอน export กลับเป็น CSV */
export function csvSafeCell(value: unknown): string {
  const s = String(value ?? "");
  const escaped = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${escaped.replace(/"/g, '""')}"`;
}

export interface ExcelParseResult {
  rows: SmartImportRow[];
  sheetName: string;
  usedHeader: boolean;
  needsReviewCount: number;
  total: number;
}

/** แปลง matrix ของเซลล์เป็นข้อความ TSV แล้วส่งให้ parser เดิม */
export function rowsToTsv(matrix: unknown[][]): string {
  return matrix
    .map((r) => (r ?? []).map((c) => String(c ?? "").replace(/[\t\n]+/g, " ").trim()).join("\t"))
    .filter((line) => line.replace(/\t/g, "").trim().length > 0)
    .join("\n");
}

export function summarize(rows: SmartImportRow[]): { needsReviewCount: number; total: number } {
  return {
    needsReviewCount: rows.filter((r) => r.needsReview).length,
    total: rows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.qty) || 0), 0),
  };
}

/** อ่านไฟล์จริงในเบราว์เซอร์ (xlsx ใช้ไลบรารีที่โปรเจกต์มีอยู่แล้ว) */
export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  const check = checkExcelFile(file);
  if (!check.ok) throw new Error(check.reason);

  let text = "";
  let sheetName = "";
  if (check.kind === "csv") {
    text = await file.text();
  } else {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    sheetName = wb.SheetNames[0] ?? "";
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
    text = rowsToTsv(matrix);
  }

  const parsed = parseSmartImport(text);
  const { needsReviewCount, total } = summarize(parsed.rows);
  return { rows: parsed.rows, sheetName, usedHeader: parsed.usedHeader, needsReviewCount, total };
}

/** แถวที่พอส่งได้: มีชื่อสินค้า + จำนวนมากกว่า 0 */
export function isSubmittableRow(r: SmartImportRow): boolean {
  return !!r.name?.trim() && Number(r.qty) > 0;
}

export function toIntakeItems(rows: SmartImportRow[]) {
  return rows.filter(isSubmittableRow).map((r, i) => ({
    order: i + 1,
    code: r.code ?? "",
    name: r.name.trim(),
    unit: r.unit || "ชิ้น",
    qty: Number(r.qty) || 0,
    price: Number(r.price) || 0,
    total: (Number(r.qty) || 0) * (Number(r.price) || 0),
    needsReview: !!r.needsReview,
  }));
}

export function intakeItemsToCsv(items: ReturnType<typeof toIntakeItems>): string {
  const head = ["ลำดับ", "รหัส", "รายการ", "จำนวน", "หน่วย", "ราคา", "รวม"];
  const lines = [head.map(csvSafeCell).join(",")];
  for (const it of items) {
    lines.push([it.order, it.code, it.name, it.qty, it.unit, it.price, it.total].map(csvSafeCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}
