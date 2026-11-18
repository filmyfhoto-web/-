/**
 * Smart Import — แปลงข้อความที่คัดลอกจาก Excel / Google Sheets / CSV
 * ให้กลายเป็นรายการสินค้าสำหรับ "ใบเขียนเบิก"
 *
 * ไม่ยุ่งกับสต๊อก: เป็นการอ่านข้อความล้วน ๆ
 */

export type SmartImportRow = {
  /** ลำดับตามต้นฉบับ (1-based) */
  order: number;
  code: string;
  name: string;
  unit: string;
  price: number;
  qty: number;
  /** true = ข้อมูลไม่ครบ/อ่านไม่ชัด ต้องให้ผู้ใช้ตรวจสอบ */
  needsReview: boolean;
  reviewNote?: string;
  raw: string;
};

export type SmartImportResult = {
  rows: SmartImportRow[];
  usedHeader: boolean;
  skippedEmptyLines: number;
};

const FIELD_KEYS = {
  code: ["รหัส", "รหัสสินค้า", "sku", "code", "item code", "no", "ลำดับ"],
  name: ["รายการสินค้า", "รายการ", "ชื่อสินค้า", "สินค้า", "product", "item", "description", "name", "รายละเอียด"],
  price: ["ราคา", "ราคาต่อหน่วย", "ราคา/หน่วย", "unit price", "price", "ราคาขาย"],
  qty: ["จำนวน", "qty", "quantity", "amount", "จน."],
  unit: ["หน่วย", "unit", "uom"],
  total: ["รวม", "ยอดรวม", "total", "sum", "จำนวนเงิน"],
} as const;

type FieldKey = keyof typeof FIELD_KEYS;

export const UNIT_WORDS = [
  "ชิ้น", "อัน", "แพ็ค", "แพ็ก", "กล่อง", "ห่อ", "รีม", "ม้วน", "เล่ม", "ชุด", "โหล", "ด้าม", "ตัว",
  "แผ่น", "ซอง", "ถุง", "ขวด", "กระป๋อง", "คู่", "งาน", "ตร.ม.", "เมตร", "กิโลกรัม", "กก.", "แท่ง",
];

/** ล้างตัวเลขที่มี comma, ฿, "บาท", ช่องว่าง */
export function cleanNumber(input: string): number | null {
  if (input == null) return null;
  const s = String(input)
    .replace(/[฿,\s]/g, "")
    .replace(/บาท|baht|thb/gi, "")
    .replace(/[()]/g, "")
    .trim();
  if (!s) return null;
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(lines: string[]): RegExp {
  if (lines.some((l) => l.includes("\t"))) return /\t/;
  if (lines.some((l) => l.includes(","))) return /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
  if (lines.some((l) => /\s{2,}/.test(l))) return /\s{2,}/;
  return /\t/;
}

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[\s._:*]/g, "").trim();
}

function matchField(cell: string): FieldKey | null {
  const norm = normalizeHeader(cell);
  if (!norm) return null;
  for (const key of Object.keys(FIELD_KEYS) as FieldKey[]) {
    for (const alias of FIELD_KEYS[key]) {
      const a = normalizeHeader(alias);
      if (norm === a || norm.startsWith(a) || a.startsWith(norm)) return key;
    }
  }
  return null;
}

function splitLine(line: string, delim: RegExp): string[] {
  return line
    .split(delim)
    .map((c) => c.replace(/^"(.*)"$/s, "$1").trim());
}

function looksLikeHeader(cells: string[]): boolean {
  const matched = cells.filter((c) => matchField(c) !== null).length;
  const numeric = cells.filter((c) => cleanNumber(c) !== null).length;
  return matched >= 2 && numeric === 0;
}

function guessUnit(cells: string[]): string {
  for (const c of cells) {
    const v = c.trim();
    if (!v) continue;
    if (cleanNumber(v) !== null) continue;
    if (v.length <= 12 && UNIT_WORDS.some((u) => v === u || v.startsWith(u))) return v;
  }
  return "";
}

/** parse ข้อความที่ผู้ใช้วางลงมา */
export function parseSmartImport(text: string, defaultUnit = "ชิ้น"): SmartImportResult {
  const allLines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const lines = allLines.filter((l) => l.trim().length > 0);
  const skippedEmptyLines = allLines.length - lines.length;
  if (lines.length === 0) return { rows: [], usedHeader: false, skippedEmptyLines };

  const delim = detectDelimiter(lines);
  const table = lines.map((l) => splitLine(l, delim).filter((c, i, arr) => !(c === "" && i === arr.length - 1)));

  let usedHeader = false;
  let map: Partial<Record<FieldKey, number>> = {};
  let body = table;

  if (looksLikeHeader(table[0])) {
    usedHeader = true;
    table[0].forEach((cell, idx) => {
      const key = matchField(cell);
      // "ลำดับ" ที่เป็นคอลัมน์แรกจะถูก map เป็น code — ยอมรับได้ แต่จะกรองทิ้งถ้าเป็นเลขล้วน
      if (key && map[key] === undefined) map[key] = idx;
    });
    body = table.slice(1);
  }

  const rows: SmartImportRow[] = [];
  body.forEach((cells, i) => {
    const raw = cells.join("\t");
    let name = "";
    let code = "";
    let unit = "";
    let price: number | null = null;
    let qty: number | null = null;

    if (usedHeader) {
      const at = (k: FieldKey) => (map[k] === undefined ? "" : (cells[map[k] as number] ?? ""));
      name = at("name").trim();
      code = at("code").trim();
      unit = at("unit").trim();
      price = cleanNumber(at("price"));
      qty = cleanNumber(at("qty"));
      if (/^\d+$/.test(code) && !at("code")) code = "";
      // ถ้า "รหัส" เป็นเลขลำดับ 1..n ให้ทิ้ง
      if (/^\d{1,3}$/.test(code) && Number(code) === i + 1) code = "";
      if (price == null) {
        const total = cleanNumber(at("total"));
        if (total != null && qty) price = total / qty;
      }
    } else {
      const numericIdx: number[] = [];
      cells.forEach((c, idx) => {
        if (cleanNumber(c) !== null) numericIdx.push(idx);
      });
      const textCells = cells.filter((c, idx) => !numericIdx.includes(idx) && c.trim());
      // ชื่อสินค้า = ข้อความที่ยาวที่สุด
      name = textCells.slice().sort((a, b) => b.length - a.length)[0]?.trim() ?? "";
      unit = guessUnit(textCells.filter((c) => c !== name));
      const first = cells.find((c) => c.trim());
      if (first && first !== name && /^[A-Za-z0-9\-_/]{2,20}$/.test(first.trim()) && cleanNumber(first) === null) {
        code = first.trim();
      }
      const nums = numericIdx.map((idx) => cleanNumber(cells[idx]) as number);
      // ตัดเลขลำดับหัวแถวออก (คอลัมน์แรกและตรงกับลำดับ)
      if (numericIdx[0] === 0 && nums[0] === i + 1 && nums.length > 1) nums.shift();
      if (nums.length >= 2) {
        price = nums[0];
        qty = nums[1];
      } else if (nums.length === 1) {
        price = nums[0];
      }
    }

    if (!name && !code && price == null && qty == null) return;

    let needsReview = false;
    const notes: string[] = [];
    if (!name) {
      name = code || "(ไม่พบชื่อสินค้า)";
      needsReview = true;
      notes.push("ไม่พบชื่อสินค้า");
    }
    if (price == null) {
      price = 0;
      needsReview = true;
      notes.push("ไม่พบราคา");
    }
    if (qty == null || qty <= 0) {
      qty = qty && qty > 0 ? qty : 1;
      if (!usedHeader || map.qty === undefined) notes.push("ไม่พบจำนวน ใช้ค่าเริ่มต้น 1");
      else notes.push("จำนวนไม่ถูกต้อง ใช้ค่าเริ่มต้น 1");
      needsReview = true;
    }

    rows.push({
      order: rows.length + 1,
      code,
      name,
      unit: unit || defaultUnit,
      price,
      qty,
      needsReview,
      reviewNote: needsReview ? notes.join(" · ") : undefined,
      raw,
    });
  });

  return { rows, usedHeader, skippedEmptyLines };
}

export const __smartImportInternals = { matchField, looksLikeHeader, detectDelimiter };
export type { FieldKey };
