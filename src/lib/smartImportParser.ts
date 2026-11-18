/**
 * Smart importer for order line items.
 *
 * Accepts:
 *  - Delimited text (CSV, TSV, semicolon-separated) with or without a header row
 *  - Free-form pasted text like  `เสื้อ M x 2 = 250`  or  `กางเกง × 1 @ 890`
 *
 * Returns `{ columns, rows }` — `columns` is the list of source column names
 * (auto-generated for header-less input) and `rows` is `Array<Record<column, value>>`.
 */
export type ImportedRow = Record<string, string>;
export interface ParsedImport {
  columns: string[];
  rows: ImportedRow[];
}

export type TargetField = "product_name" | "product_code" | "qty" | "price" | "note";

const DELIMS = [",", "\t", ";", "|"];

/** Pick the delimiter that appears most on the first non-empty line. */
function detectDelim(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  let best = ","; let count = -1;
  for (const d of DELIMS) {
    const c = (first.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (c > count) { best = d; count = c; }
  }
  return count > 0 ? best : ",";
}

/** Split a CSV/TSV line respecting simple `"quoted, cells"`. */
function splitLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; continue; }
    if (ch === d && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Heuristic: does this row look like a header? (all cells non-numeric) */
function looksLikeHeader(cells: string[]): boolean {
  return cells.length > 1 && cells.every((c) => c && !/^-?\d[\d,.\s]*$/.test(c));
}

export function parseDelimited(text: string): ParsedImport {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };
  const d = detectDelim(text);
  const first = splitLine(lines[0], d);
  const hasHeader = looksLikeHeader(first);
  const columns = hasHeader
    ? first.map((c, i) => c || `col_${i + 1}`)
    : first.map((_, i) => `col_${i + 1}`);
  const bodyLines = hasHeader ? lines.slice(1) : lines;
  const rows = bodyLines.map((ln) => {
    const cells = splitLine(ln, d);
    const r: ImportedRow = {};
    columns.forEach((c, i) => { r[c] = cells[i] ?? ""; });
    return r;
  });
  return { columns, rows };
}

/**
 * Free-form parser for messages like:
 *   `เสื้อยืด M x 2 = 250`
 *   `กางเกง × 1 @ 890`
 *   `รหัส A01 ผ้าลาย 3 ชิ้น 120`
 *
 * Extracts name, qty, unit price by regex — best-effort.
 */
export function parseFreeform(text: string): ParsedImport {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const columns = ["product_name", "qty", "price"];
  const rows: ImportedRow[] = [];
  const re = /^(.+?)\s*[x×@]\s*(\d+(?:\.\d+)?)\s*(?:[=@]|ชิ้น|อัน|ตัว|ราคา|บาท)?\s*(\d+(?:[.,]\d+)?)?\s*(?:บาท)?$/i;
  for (const ln of lines) {
    const m = ln.match(re);
    if (m) {
      rows.push({
        product_name: m[1].trim(),
        qty: m[2],
        price: (m[3] || "0").replace(/,/g, ""),
      });
      continue;
    }
    // fallback: split by whitespace, last number = price, second-last = qty
    const parts = ln.split(/\s+/);
    const nums = parts.filter((p) => /^\d+(?:[.,]\d+)?$/.test(p));
    if (nums.length >= 1) {
      const price = nums[nums.length - 1].replace(/,/g, "");
      const qty = nums.length >= 2 ? nums[nums.length - 2] : "1";
      const nameParts = parts.filter((p) => !nums.includes(p));
      rows.push({ product_name: nameParts.join(" ") || ln, qty, price });
    } else {
      rows.push({ product_name: ln, qty: "1", price: "0" });
    }
  }
  return { columns, rows };
}

/** Guess the target field for a source column name (Thai + English). */
export function guessMapping(sourceColumn: string): TargetField | "" {
  const s = sourceColumn.toLowerCase().replace(/[\s_]/g, "");
  if (/(name|item|product|สินค้า|รายการ|ชื่อ)/i.test(s)) return "product_name";
  if (/(code|sku|รหัส)/i.test(s)) return "product_code";
  if (/(qty|quantity|จำนวน|amount)/i.test(s)) return "qty";
  if (/(price|ราคา|unit)/i.test(s)) return "price";
  if (/(note|remark|หมายเหตุ)/i.test(s)) return "note";
  return "";
}

export function toNumber(v: string): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}