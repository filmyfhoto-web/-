// Smart paste/sheet parser: detects delimiter, optional header, and infers
// which column is name / price / qty / unit. Designed so that users can paste
// from anywhere (Excel, Google Sheets, Word, PDF, chat, web tables) and still
// get rows mapped to {name, price, quantity, unit}.

export type ParsedRow = {
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

export type ParseMeta = {
  delimiter: string; // human label: "TAB" | "," | ";" | "|" | "SPACE" | "FIXED"
  hasHeader: boolean;
  rowCount: number;
  mapping: { name: number; price: number; quantity: number; unit: number; amount?: number };
};

export type ParseError = {
  line: number;     // 1-based source line / sheet row
  raw: string;      // original line text or joined cells
  reason: string;   // human-readable thai reason
};

export type ParseResult = {
  rows: ParsedRow[];
  meta: ParseMeta;
  errors: ParseError[];
  /** Cleaned 2D matrix used for parsing — handy for remap-column UI. */
  matrix: string[][];
  /** True when the first row was used as a header. */
  hasHeader: boolean;
};

const SKIP_LINE_RE =
  /^(รวม(ทั้งสิ้น|เงิน)?|ยอด(รวม|สุทธิ)?|total|subtotal|grand\s*total|vat|ภาษี|ส่วนลด|discount|หมายเหตุ|note)/i;

// Partial-match patterns, evaluated in priority order so that the more specific
// headers (amount, unit) claim their column before the more generic ones
// (price, quantity, name). This handles purchase-order style sheets like
// "รายการ | จำนวน | หน่วย | ราคาต่อหน่วย (บาท) | จำนวนเงิน (บาท)".
type HeaderRole = "amount" | "unit" | "price" | "quantity" | "name";
const HEADER_KEYS: Record<HeaderRole, RegExp> = {
  amount: /(จำนวนเงิน|รวมเงิน|ยอด(รวม|สุทธิ)|line\s*total|^total$|^subtotal$|^amount$)/i,
  unit: /(หน่วย(นับ)?|^uom$|^units?$)/i,
  price: /(ราคา(ต่อหน่วย|\/หน่วย)?|unit\s*price|^price$|^cost$|ราคา\s*\(บาท\))/i,
  quantity: /(จำนวน(?!เงิน)|ปริมาณ|จน\.?|^qty$|^quantity$|^count$)/i,
  name: /(รายการ|รายละเอียด|พัสดุ|ชื่อ(สินค้า|รายการ)?|^สินค้า$|^name$|^item$|^product$|description|^desc$)/i,
};

const KNOWN_UNITS = new Set(
  [
    "ชิ้น","แผ่น","กล่อง","รีม","ห่อ","อัน","ตัว","เล่ม","ขวด","ใบ","ชุด","แพ็ค","แพค","ถุง","กระป๋อง","ม้วน","แท่ง","คู่","โหล","ลัง","ตลับ",
    "กก","กก.","กิโล","กิโลกรัม","กรัม","ลิตร","มล","มล.","ซม","ซม.","ม","ม.","นิ้ว","ฟุต",
    "pcs","pc","pack","pkg","box","set","ream","unit","units","kg","g","mg","l","ml","m","cm","mm","inch","ft","pair","dozen","case","roll","bottle","sheet","sheets","item","items",
  ].map((s) => s.toLowerCase()),
);

function stripCurrency(s: string): string {
  return String(s ?? "")
    // currency symbols
    .replace(/[฿$€£¥₩]/g, "")
    // currency words (thai/eng)
    .replace(/บาท|baht|thb|usd|eur|rmb|jpy/gi, "")
    // unicode spaces (NBSP, narrow NBSP, thin space, ideographic) → normal space
    .replace(/[\u00A0\u202F\u2007\u2009\u3000]/g, " ")
    // apostrophe thousand separators (Swiss): 1'250 → 1250
    .replace(/(\d)'(\d{3})/g, "$1$2")
    // parenthesised negatives: (1,250) → -1250
    .replace(/^\(([^)]+)\)$/, "-$1")
    .trim();
}

export function toNumber(s: string): number | null {
  let cleaned = stripCurrency(String(s ?? ""));
  if (!cleaned) return null;
  // Strip leading 'x' / 'X' (e.g. "x10")
  cleaned = cleaned.replace(/^x\s*/i, "");

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Decide which is the decimal separator by the right-most occurrence.
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // European: 1.250,00
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US/TH: 1,250.00
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Comma only — if exactly one comma followed by 1–2 digits, treat as decimal
    const m = cleaned.match(/^(-?\d+),(\d{1,2})$/);
    if (m) cleaned = `${m[1]}.${m[2]}`;
    else cleaned = cleaned.replace(/,/g, "");
  }

  // Space-as-thousand-separator: "1 250.00" / "1 250" → "1250.00" / "1250"
  // Only collapse spaces that sit between digit groups.
  cleaned = cleaned.replace(/(\d)\s+(?=\d{3}(\D|$))/g, "$1");
  cleaned = cleaned.replace(/\s+/g, "");

  if (!cleaned) return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function looksNumeric(s: string): boolean {
  return toNumber(s) !== null;
}

function looksUnit(s: string): boolean {
  const v = (s ?? "").toLowerCase().trim();
  if (!v) return false;
  if (v.length > 12) return false;
  if (KNOWN_UNITS.has(v)) return true;
  // also accept short unit-like words such as "ชิ้น." "pcs."
  return KNOWN_UNITS.has(v.replace(/\.$/, ""));
}

function cleanLine(line: string): string {
  // Strip leading numbering like "1. ", "1) ", "01: "
  return line.replace(/^\s*\d{1,3}\s*[.)\-:]\s+/, "").trim();
}

function detectDelimiter(lines: string[]): { delim: RegExp; label: string } {
  const candidates: { re: RegExp; label: string }[] = [
    { re: /\t/, label: "TAB" },
    { re: /\|/, label: "|" },
    { re: /;/, label: ";" },
    { re: /,/, label: "," },
    { re: / · |·|→|—/, label: "·" },
    { re: /\s{2,}/, label: "SPACE" },
  ];
  let best = { score: -1, choice: candidates[candidates.length - 1] };
  for (const c of candidates) {
    const counts = lines.map((l) => l.split(c.re).length);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= lines.length) continue; // no splits
    const avg = total / counts.length;
    if (avg < 2) continue;
    const variance =
      counts.reduce((a, b) => a + (b - avg) ** 2, 0) / counts.length;
    // higher avg cols, lower variance is better
    const score = avg * 10 - variance * 5;
    if (score > best.score) best = { score, choice: c };
  }
  return { delim: best.choice.re, label: best.choice.label };
}

function splitRow(line: string, delim: RegExp): string[] {
  return line.split(delim).map((c) => c.trim()).filter((c, _, arr) => arr.length > 1 || c.length > 0);
}

function detectHeader(cols: string[]): ParseMeta["mapping"] | null {
  const m: ParseMeta["mapping"] = { name: -1, price: -1, quantity: -1, unit: -1 };
  const used = new Set<number>();
  const order: HeaderRole[] = ["amount", "unit", "price", "quantity", "name"];
  let hits = 0;
  for (const role of order) {
    for (let i = 0; i < cols.length; i++) {
      if (used.has(i)) continue;
      const c = (cols[i] ?? "").trim();
      if (!c) continue;
      if (HEADER_KEYS[role].test(c)) {
        if (role === "amount") m.amount = i;
        else m[role] = i;
        used.add(i);
        hits++;
        break;
      }
    }
  }
  return hits >= 2 ? m : null;
}

function inferMapping(matrix: string[][]): ParseMeta["mapping"] {
  const cols = Math.max(...matrix.map((r) => r.length));
  const stats = Array.from({ length: cols }, () => ({
    numeric: 0,
    intSmall: 0,
    unitLike: 0,
    textLen: 0,
    nonEmpty: 0,
    maxNum: 0,
  }));
  for (const row of matrix) {
    for (let i = 0; i < cols; i++) {
      const v = (row[i] ?? "").trim();
      if (!v) continue;
      stats[i].nonEmpty++;
      const n = toNumber(v);
      if (n !== null) {
        stats[i].numeric++;
        if (n > stats[i].maxNum) stats[i].maxNum = n;
        if (Number.isInteger(n) && n > 0 && n < 10000 && !/[.,]/.test(v)) {
          stats[i].intSmall++;
        }
      } else {
        stats[i].textLen += v.length;
        if (looksUnit(v)) stats[i].unitLike++;
      }
    }
  }

  const used = new Set<number>();
  const pick = (score: (i: number) => number, min = -Infinity): number => {
    let best = -1;
    let bestScore = min;
    for (let i = 0; i < cols; i++) {
      if (used.has(i)) continue;
      const s = score(i);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best >= 0) used.add(best);
    return best;
  };

  // unit first (most specific signal)
  const unit = pick((i) => (stats[i].unitLike > 0 ? stats[i].unitLike : -1), 0);
  // name = column with most text / least numeric ratio
  const name = pick((i) => {
    const ne = stats[i].nonEmpty || 1;
    const textiness = stats[i].textLen / ne - (stats[i].numeric / ne) * 50;
    return textiness;
  });
  // price = numeric column with the largest max value
  const price = pick((i) => (stats[i].numeric > 0 ? stats[i].maxNum + stats[i].numeric : -1), 0);
  // quantity = remaining integer-like column
  const quantity = pick((i) => (stats[i].intSmall > 0 ? stats[i].intSmall : stats[i].numeric > 0 ? 0.1 : -1), 0);

  return { name, price, quantity, unit };
}

// When no header is present, prefer the conventional left-to-right ordering
// of purchase-order style sheets: [name, qty, unit, price, amount?]. Falls
// back to the older [name, price, qty, unit] order if column 3 isn't a unit
// word, and finally to statistical inference.
function positionalOrInfer(matrix: string[][]): ParseMeta["mapping"] {
  if (!matrix.length) return inferMapping(matrix);
  const cols = Math.max(...matrix.map((r) => r.length));
  if (cols < 2) return inferMapping(matrix);
  const sample = matrix.slice(0, Math.min(matrix.length, 20));
  const colNumericRatio = (i: number) => {
    let num = 0, nonEmpty = 0;
    for (const r of sample) {
      const v = (r[i] ?? "").trim();
      if (!v) continue;
      nonEmpty++;
      if (looksNumeric(v)) num++;
    }
    return nonEmpty ? num / nonEmpty : 0;
  };
  const colUnitRatio = (i: number) => {
    let u = 0, nonEmpty = 0;
    for (const r of sample) {
      const v = (r[i] ?? "").trim();
      if (!v) continue;
      nonEmpty++;
      if (looksUnit(v)) u++;
    }
    return nonEmpty ? u / nonEmpty : 0;
  };
  const col0Text = colNumericRatio(0) < 0.5;
  const col1Num = colNumericRatio(1) >= 0.5;
  // New PO-style layout: name | qty | unit | price [| amount]
  if (col0Text && col1Num && cols >= 4 && colUnitRatio(2) >= 0.5 && colNumericRatio(3) >= 0.5) {
    const map: ParseMeta["mapping"] = { name: 0, quantity: 1, unit: 2, price: 3 };
    if (cols >= 5 && colNumericRatio(4) >= 0.5) map.amount = 4;
    return map;
  }
  // 3-col PO layout: name | qty | unit
  if (col0Text && col1Num && cols === 3 && colUnitRatio(2) >= 0.5) {
    return { name: 0, quantity: 1, unit: 2, price: 1 };
  }
  // Legacy layout: name | price | qty | unit
  const col2Num = cols < 3 ? true : colNumericRatio(2) >= 0.5;
  if (col0Text && col1Num && col2Num) {
    return {
      name: 0,
      price: Math.min(1, cols - 1),
      quantity: Math.min(2, cols - 1),
      unit: Math.min(3, cols - 1),
    };
  }
  return inferMapping(matrix);
}

function parseSingleLineFallback(line: string): ParsedRow | null {
  // e.g. "ปริ้นสี ฿15 x10 แผ่น"  or  "กระดาษ A4 120 5 รีม"
  const m = line.match(
    /^(.+?)\s+฿?\s*([\d.,]+)\s+x?\s*(\d+)\s*(\S+)?\s*$/u,
  );
  if (!m) return null;
  const price = toNumber(m[2]);
  const qty = toNumber(m[3]);
  if (price === null || qty === null) return null;
  return {
    name: m[1].trim(),
    price,
    quantity: qty,
    unit: (m[4] ?? "").trim(),
  };
}

function buildRow(cols: string[], map: ParseMeta["mapping"]): ParsedRow | null {
  const name = (cols[map.name] ?? "").trim();
  const priceStr = cols[map.price] ?? "";
  const qtyStr = cols[map.quantity] ?? "";
  let unit = (cols[map.unit] ?? "").trim();

  let price = toNumber(priceStr) ?? 0;
  let quantity = toNumber(qtyStr) ?? 1;

  // If a "จำนวนเงิน" (amount/line-total) column was mapped, use it to
  // back-fill price when price is missing.
  if (map.amount !== undefined && map.amount >= 0) {
    const amt = toNumber(cols[map.amount] ?? "");
    if (amt !== null && (!price || price === 0) && quantity > 0) {
      price = +(amt / quantity).toFixed(4);
    }
  }

  // If quantity column was missing but name has trailing "10 ชิ้น"
  if ((!quantity || quantity === 1) && name) {
    const m = name.match(/\s(\d+)\s*([\p{L}.]+)?$/u);
    if (m) {
      const q = Number(m[1]);
      if (q > 0) {
        quantity = q;
        if (!unit && m[2]) unit = m[2];
      }
    }
  }
  if (!name) return null;
  return { name, price, quantity, unit };
}

export function smartParseText(text: string): ParseResult {
  const errors: ParseError[] = [];
  const allLines = text.split(/\r?\n/);
  const rawLines: { text: string; line: number }[] = [];
  allLines.forEach((l, i) => {
    const cleaned = cleanLine(l);
    if (!cleaned) return; // empty / whitespace → silently skipped
    if (SKIP_LINE_RE.test(cleaned)) return; // summary row → silently skipped
    rawLines.push({ text: cleaned, line: i + 1 });
  });

  if (!rawLines.length) {
    return {
      rows: [],
      errors,
      matrix: [],
      hasHeader: false,
      meta: { delimiter: "TAB", hasHeader: false, rowCount: 0, mapping: { name: 0, price: 1, quantity: 2, unit: 3 } },
    };
  }

  const linesOnly = rawLines.map((l) => l.text);

  const { delim, label } = detectDelimiter(linesOnly);
  const matrix = linesOnly.map((l) => splitRow(l, delim));

  // Single-column case → try single-line regex per row
  if (matrix.every((r) => r.length < 2)) {
    const rows: ParsedRow[] = [];
    rawLines.forEach((rl) => {
      const r = parseSingleLineFallback(rl.text);
      if (r) rows.push(r);
      else errors.push({ line: rl.line, raw: rl.text, reason: "อ่านรูปแบบบรรทัดเดียวไม่ออก — ต้องมีชื่อ + ราคา + จำนวน" });
    });
    return {
      rows,
      errors,
      matrix: linesOnly.map((l) => [l]),
      hasHeader: false,
      meta: { delimiter: "FIXED", hasHeader: false, rowCount: rows.length, mapping: { name: 0, price: 1, quantity: 2, unit: 3 } },
    };
  }

  let headerMap = detectHeader(matrix[0]);
  const hasHeader = !!headerMap;
  const bodyLines = hasHeader ? rawLines.slice(1) : rawLines;
  const body = hasHeader ? matrix.slice(1) : matrix;
  const mapping = headerMap ?? positionalOrInfer(body);

  // Ensure required columns exist
  if (mapping.name < 0) mapping.name = 0;
  if (mapping.price < 0) mapping.price = Math.min(1, matrix[0].length - 1);
  if (mapping.quantity < 0) mapping.quantity = Math.min(2, matrix[0].length - 1);
  if (mapping.unit < 0) mapping.unit = Math.min(3, matrix[0].length - 1);

  const rows: ParsedRow[] = [];
  body.forEach((cols, i) => {
    const r = buildRow(cols, mapping);
    const src = bodyLines[i];
    if (r) rows.push(r);
    else errors.push({
      line: src?.line ?? i + 1,
      raw: src?.text ?? cols.join(" | "),
      reason: "ไม่พบชื่อสินค้าในแถวนี้",
    });
  });

  return {
    rows,
    errors,
    matrix,
    hasHeader,
    meta: { delimiter: label, hasHeader, rowCount: rows.length, mapping },
  };
}

export function smartParseMatrix(matrix: any[][]): ParseResult {
  const errors: ParseError[] = [];
  const norm = matrix
    .map((r) => r.map((c) => (c == null ? "" : String(c).trim())))
    .filter((r) => r.some((c) => c.length > 0));
  if (!norm.length) {
    return {
      rows: [],
      errors,
      matrix: [],
      hasHeader: false,
      meta: { delimiter: "SHEET", hasHeader: false, rowCount: 0, mapping: { name: 0, price: 1, quantity: 2, unit: 3 } },
    };
  }
  // Drop summary rows
  const filtered = norm.filter((r) => !SKIP_LINE_RE.test(r[0] ?? ""));
  let headerMap = detectHeader(filtered[0] ?? []);
  const hasHeader = !!headerMap;
  const body = hasHeader ? filtered.slice(1) : filtered;
  const mapping = headerMap ?? positionalOrInfer(body);
  if (mapping.name < 0) mapping.name = 0;
  if (mapping.price < 0) mapping.price = 1;
  if (mapping.quantity < 0) mapping.quantity = 2;
  if (mapping.unit < 0) mapping.unit = 3;
  const rows: ParsedRow[] = [];
  body.forEach((cols, i) => {
    const r = buildRow(cols, mapping);
    if (r) rows.push(r);
    else errors.push({ line: i + (hasHeader ? 2 : 1), raw: cols.join(" | "), reason: "ไม่พบชื่อสินค้าในแถวนี้" });
  });
  return {
    rows,
    errors,
    matrix: filtered,
    hasHeader,
    meta: { delimiter: "SHEET", hasHeader, rowCount: rows.length, mapping },
  };
}

/**
 * Re-derive rows from an existing matrix and a user-overridden column mapping.
 * Used by the SmartImportDialog when the user changes which column maps to
 * name/price/quantity/unit.
 */
export function applyMapping(
  matrix: string[][],
  mapping: ParseMeta["mapping"],
  hasHeader: boolean,
): { rows: ParsedRow[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const body = hasHeader ? matrix.slice(1) : matrix;
  const rows: ParsedRow[] = [];
  body.forEach((cols, i) => {
    const r = buildRow(cols, mapping);
    if (r) rows.push(r);
    else errors.push({ line: i + (hasHeader ? 2 : 1), raw: cols.join(" | "), reason: "ไม่พบชื่อสินค้าในแถวนี้" });
  });
  return { rows, errors };
}
