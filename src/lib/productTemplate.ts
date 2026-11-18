import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ImportRow = {
  action: "add" | "delete";
  code: string;
  name?: string;
  unit?: string;
  category?: string;
  stock?: number | null;
  cost_price?: number | null;
  standard_price?: number | null;
  price_10?: number | null;
  price_15?: number | null;
  price_20?: number | null;
  _row?: number; // original spreadsheet row (2-based)
};

const HEADERS = [
  "action", "code", "name", "unit", "category", "stock",
  "cost_price", "standard_price", "price_10", "price_15", "price_20",
];

// ภาษาไทย display headers — used in the downloaded template files.
// The parser accepts BOTH the Thai labels below and the canonical English
// keys above (backwards-compat with older files).
const TH_HEADERS = [
  "การดำเนินการ", "รหัสสินค้า", "ชื่อสินค้า", "หน่วยนับ", "หมวดหมู่",
  "สต๊อก", "ราคาทุน", "ราคามาตรฐาน", "ราคา +10%", "ราคา +15%", "ราคา +20%",
];

// Map of Thai header → canonical English field. Lowercase + trim for matching.
const TH_TO_EN: Record<string, string> = {
  "การดำเนินการ": "action",
  "รหัส": "code",
  "รหัสสินค้า": "code",
  "ชื่อ": "name",
  "ชื่อสินค้า": "name",
  "หน่วย": "unit",
  "หน่วยนับ": "unit",
  "หมวดหมู่": "category",
  "หมวด": "category",
  "สต๊อก": "stock",
  "คงเหลือ": "stock",
  "ราคาทุน": "cost_price",
  "ทุน": "cost_price",
  "ราคามาตรฐาน": "standard_price",
  "ราคา": "standard_price",
  "ราคา +10%": "price_10",
  "ราคา +15%": "price_15",
  "ราคา +20%": "price_20",
  "ราคา10": "price_10",
  "ราคา15": "price_15",
  "ราคา20": "price_20",
};

function normalizeKey(k: string): string {
  const t = String(k ?? "").trim();
  return TH_TO_EN[t] ?? TH_TO_EN[t.toLowerCase()] ?? t.toLowerCase();
}

const SAMPLE = [
  {
    action: "add", code: "SKU-001", name: "ปากกาลูกลื่น สีน้ำเงิน", unit: "ด้าม",
    category: "เครื่องเขียน", stock: 100, cost_price: 5, standard_price: 10,
    price_10: "", price_15: "", price_20: "",
  },
  {
    action: "add", code: "SKU-002", name: "สมุดโน้ต A5", unit: "เล่ม",
    category: "เครื่องเขียน", stock: 50, cost_price: 20, standard_price: 35,
    price_10: 22, price_15: 23, price_20: 24,
  },
];

const TEMPLATE_ROWS = 50; // editable data rows pre-filled with formulas

export function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // Build sheet via array-of-arrays so we can embed real Excel formulas.
  // Row 1 = Thai display labels (what the user sees)
  // Row 2 = English canonical keys (what the parser reads — kept hidden from
  //         humans but parsed deterministically)
  const aoa: any[][] = [TH_HEADERS, HEADERS];
  // Seed example rows (use values; formulas will be injected for price_10/15/20)
  for (const s of SAMPLE) {
    aoa.push(HEADERS.map(h => (s as any)[h] ?? ""));
  }
  // Pad with blank rows so users get formula cells ready to use
  while (aoa.length - 2 < TEMPLATE_ROWS) {
    aoa.push(["add", "", "", "ชิ้น", "", "", "", "", "", "", ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column letters: A action, B code, C name, D unit, E category,
  // F stock, G cost_price, H standard_price, I price_10, J price_15, K price_20
  // Data rows start at spreadsheet row 3 (row 1 = Thai labels, row 2 = English keys).
  for (let r = 3; r <= aoa.length; r++) {
    const stdRef = `H${r}`;
    const cells: Array<[string, number]> = [
      [`I${r}`, 1.10],
      [`J${r}`, 1.15],
      [`K${r}`, 1.20],
    ];
    for (const [addr, mult] of cells) {
      // Preserve seeded numeric overrides (e.g. example showing manual price)
      const existing = (ws as any)[addr];
      if (existing && existing.t === "n" && typeof existing.v === "number") continue;
      delete (ws as any)[addr];
      (ws as any)[addr] = {
        t: "n",
        f: `IF(OR(${stdRef}="",${stdRef}=0),"",ROUND(${stdRef}*${mult},2))`,
      };
    }
  }

  (ws as any)["!cols"] = [
    { wch: 8 }, { wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 16 },
    { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Products");

  // README sheet
  const help = [
    { คอลัมน์: "การดำเนินการ (action)", คำอธิบาย: "add = เพิ่ม/อัปเดต, delete = ลบโดยใช้รหัสสินค้า (ค่าเริ่มต้น add)" },
    { คอลัมน์: "รหัสสินค้า (code)", คำอธิบาย: "จำเป็น — ใช้จับคู่ข้อมูลเดิม" },
    { คอลัมน์: "ชื่อสินค้า (name)", คำอธิบาย: "ชื่อที่แสดงในรายการสินค้า" },
    { คอลัมน์: "หน่วยนับ (unit)", คำอธิบาย: "เช่น ชิ้น / ด้าม / เล่ม / รีม" },
    { คอลัมน์: "หมวดหมู่ (category)", คำอธิบาย: "ชื่อหมวดหมู่ (ถ้ายังไม่มีระบบจะสร้างให้)" },
    { คอลัมน์: "สต๊อก (stock)", คำอธิบาย: "จำนวนคงเหลือ" },
    { คอลัมน์: "ราคาทุน (cost_price)", คำอธิบาย: "เห็นเฉพาะแอดมิน" },
    { คอลัมน์: "ราคามาตรฐาน (standard_price)", คำอธิบาย: "ราคาขายหน้าร้าน — ใช้เป็นฐานคำนวณราคากลุ่ม %" },
    { คอลัมน์: "ราคา +10% (price_10)", คำอธิบาย: "สูตร Excel = ROUND(ราคามาตรฐาน*1.10,2) — พิมพ์ตัวเลขทับเพื่อ override" },
    { คอลัมน์: "ราคา +15% (price_15)", คำอธิบาย: "สูตร Excel = ROUND(ราคามาตรฐาน*1.15,2) — พิมพ์ตัวเลขทับเพื่อ override" },
    { คอลัมน์: "ราคา +20% (price_20)", คำอธิบาย: "สูตร Excel = ROUND(ราคามาตรฐาน*1.20,2) — พิมพ์ตัวเลขทับเพื่อ override" },
    { คอลัมน์: "หมายเหตุ", คำอธิบาย: "แถวที่ 1 ของชีต Products = ชื่อภาษาไทย, แถวที่ 2 = รหัสภาษาอังกฤษสำหรับระบบ — ข้อมูลเริ่มที่แถวที่ 3" },
  ];
  const ws2 = XLSX.utils.json_to_sheet(help);
  (ws2 as any)["!cols"] = [{ wch: 28 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws2, "README");

  XLSX.writeFile(wb, "เทมเพลตสินค้า-นัฐภรณ์.xlsx");
}

/**
 * CSV template — works in any spreadsheet app and Google Sheets.
 * Columns match the Excel template. price_10/15/20 are blank by default;
 * fill them in only when you want to OVERRIDE the auto-formula
 * (group price = standard_price * (1 + markup/100), rounded to 2 decimals).
 */
export function downloadTemplateCSV() {
  const lines: string[] = [];
  // Excel-friendly UTF-8 BOM so Thai renders correctly
  const BOM = "\uFEFF";

  // Row 1: Thai display labels, Row 2: English canonical keys (parser reads either).
  lines.push(TH_HEADERS.join(","));
  lines.push(HEADERS.join(","));
  // sample rows
  for (const s of SAMPLE) {
    lines.push(HEADERS.map(h => csvEscape((s as any)[h])).join(","));
  }
  // 20 blank rows pre-filled with action=add
  for (let i = 0; i < 20; i++) {
    lines.push(["add", "", "", "ชิ้น", "", "", "", "", "", "", ""].join(","));
  }
  // A separate guide block (commented in spirit — but CSV has no comments, so we add an empty line then notes)
  const blob = new Blob([BOM + lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "เทมเพลตสินค้า-นัฐภรณ์.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: any): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function num(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : null;
}

function isNumLike(v: any): boolean {
  if (v === "" || v == null) return true; // blank counts as valid (= null)
  return isFinite(Number(String(v).replace(/,/g, "")));
}

export async function parseImportFile(file: File): Promise<{ rows: ImportRow[]; errors: string[] }> {
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  let wb: XLSX.WorkBook;
  if (isCsv) {
    const { text, encoding } = decodeCsvBuffer(buf);
    wb = XLSX.read(text, { type: "string" });
    // attach detected encoding for downstream logging
    (wb as any).__detectedEncoding = encoding;
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "products") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // Read as array-of-arrays so we can detect the Thai-label layout
  // (row 1 = Thai labels, row 2 = English keys, data from row 3) vs. the
  // legacy single-header layout (row 1 = English keys, data from row 2).
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const errors: string[] = [];
  const rows: ImportRow[] = [];

  if (!aoa.length) {
    errors.push("ไฟล์ว่าง — ไม่พบข้อมูลแถวใดเลย");
    return { rows, errors };
  }

  // Map every header row through `normalizeKey` so both Thai and English work.
  const row0 = aoa[0].map((c: any) => normalizeKey(String(c ?? "")));
  let headerKeys = row0;
  let dataStart = 1;
  // If row 1 was Thai labels (already normalized to English) AND row 2 is
  // also valid header keys, skip row 2 — it's the redundant English row from
  // the new template.
  if (aoa.length > 1) {
    const row1 = aoa[1].map((c: any) => normalizeKey(String(c ?? "")));
    const looksLikeHeader = row1.includes("code") && row1.includes("name");
    if (looksLikeHeader && headerKeys.includes("code")) {
      dataStart = 2;
    } else if (!headerKeys.includes("code") && looksLikeHeader) {
      headerKeys = row1;
      dataStart = 2;
    }
  }
  if (!headerKeys.includes("code")) {
    errors.push("ไฟล์ไม่ตรงเทมเพลต — ไม่พบคอลัมน์ 'รหัสสินค้า' / 'code' กรุณาดาวน์โหลดเทมเพลตล่าสุด");
    return { rows, errors };
  }

  const raw: any[] = aoa.slice(dataStart).map(arr => {
    const obj: Record<string, any> = {};
    headerKeys.forEach((k, i) => { obj[k] = arr[i] ?? ""; });
    return obj;
  });

  raw.forEach((r, i) => {
    const sheetRow = i + dataStart + 1; // 1-based spreadsheet row
    const code = String(r.code ?? "").trim();
    if (!code) {
      // Skip silent-blank padding rows (no code AND no name/action override)
      if (!String(r.name ?? "").trim() && !String(r.standard_price ?? "").trim()) return;
      errors.push(`แถวที่ ${sheetRow}: ไม่มีรหัสสินค้า`);
      return;
    }
    const action = String(r.action ?? "add").trim().toLowerCase();
    const act: "add" | "delete" = action === "delete" ? "delete" : "add";
    rows.push({
      action: act,
      code,
      name: String(r.name ?? "").trim(),
      unit: String(r.unit ?? "ชิ้น").trim() || "ชิ้น",
      category: String(r.category ?? "").trim(),
      stock: num(r.stock),
      cost_price: num(r.cost_price),
      standard_price: num(r.standard_price),
      price_10: num(r.price_10),
      price_15: num(r.price_15),
      price_20: num(r.price_20),
      _row: sheetRow,
    });
  });
  return { rows, errors };
}

/**
 * Decode a CSV ArrayBuffer with automatic encoding detection.
 * Order: UTF-8 BOM → UTF-16 BOM → UTF-8 (validated) → windows-874 (Thai) → tis-620 → latin1.
 */
export function decodeCsvBuffer(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf);
  // BOM checks
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8 (BOM)" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  }
  // Try strict UTF-8
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch { /* not valid UTF-8 */ }
  // Try Thai encodings
  for (const enc of ["windows-874", "tis-620"]) {
    try {
      const text = new TextDecoder(enc).decode(bytes);
      // sanity: must contain at least one Thai char or printable ASCII
      if (/[\u0E00-\u0E7F]/.test(text) || /[A-Za-z0-9]/.test(text)) {
        return { text, encoding: enc };
      }
    } catch { /* unsupported in this browser */ }
  }
  // Final fallback
  return { text: new TextDecoder("latin1" as any).decode(bytes), encoding: "latin1 (fallback)" };
}

export type ValidationReport = {
  errors: string[];   // blocks commit
  warnings: string[]; // commit allowed
  stats: {
    total: number;
    add: number;
    delete: number;
    duplicates: number;
    newCategories: string[];
  };
};

/**
 * Validate parsed rows BEFORE commit. Pure (no DB calls except categories lookup
 * for "new category" stats — kept simple via passed list).
 */
export function validateImportRows(
  rows: ImportRow[],
  existingCategoryNames: string[] = []
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let dup = 0;
  const newCats = new Set<string>();
  const knownCats = new Set(existingCategoryNames.map(n => n.toLowerCase()));

  let addCount = 0, delCount = 0;
  rows.forEach((r, i) => {
    const tag = `แถว ${r._row ?? i + 2} (${r.code})`;
    if (r.action !== "add" && r.action !== "delete") {
      errors.push(`${tag}: action ต้องเป็น add หรือ delete`);
    }
    if (r.action === "add") addCount++; else delCount++;

    // numeric range checks
    for (const f of ["stock", "cost_price", "standard_price", "price_10", "price_15", "price_20"] as const) {
      const v = r[f];
      if (v != null && v < 0) errors.push(`${tag}: ${f} ติดลบ (${v})`);
      if (v != null && v > 10_000_000) warnings.push(`${tag}: ${f} ค่าสูงผิดปกติ (${v})`);
    }

    // duplicate code (add only — delete-by-code dup is fine)
    if (r.action === "add") {
      const prev = seen.get(r.code);
      if (prev != null) {
        dup++;
        warnings.push(`${tag}: code ซ้ำกับแถว ${prev} — จะใช้แถวล่างสุด`);
      }
      seen.set(r.code, r._row ?? i + 2);
    }

    // override price vs standard cross-checks
    const sp = r.standard_price;
    for (const [f, mk] of [["price_10", 10], ["price_15", 15], ["price_20", 20]] as const) {
      const v = r[f];
      if (v == null) continue;
      if (sp == null) {
        warnings.push(`${tag}: ใส่ ${f} แต่ยังไม่มี standard_price`);
      } else if (v < sp) {
        warnings.push(`${tag}: ${f}=${v} ต่ำกว่า standard_price=${sp} (คาด ~${(sp * (1 + mk / 100)).toFixed(2)})`);
      }
    }

    if (r.action === "add" && r.category && !knownCats.has(r.category.toLowerCase())) {
      newCats.add(r.category);
    }
  });

  return {
    errors,
    warnings,
    stats: {
      total: rows.length, add: addCount, delete: delCount,
      duplicates: dup, newCategories: Array.from(newCats),
    },
  };
}

export type RowResult = {
  row: number;
  code: string;
  action: "add" | "delete";
  status: "success" | "failed" | "skipped";
  message?: string;
  costSet?: boolean;
  pricesSet?: number;
  mode?: "insert" | "update" | "delete";
};

export type ImportSummary = {
  added: number;        // new rows inserted
  updated: number;      // existing rows updated
  deleted: number;
  failed: number;
  costsSet: number;
  pricesSet: number;
  rows: RowResult[];
  errors: string[];     // legacy aggregate
};

export type ImportProgress = {
  stage: "prepare" | "delete" | "upsert" | "done";
  done: number;
  total: number;
  message?: string;
};

export async function commitImport(
  rows: ImportRow[],
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportSummary> {
  const total = rows.length;
  const emit = (p: ImportProgress) => { try { onProgress?.(p); } catch { /* ignore */ } };
  const yieldNow = () => new Promise<void>(r => setTimeout(r, 0));
  emit({ stage: "prepare", done: 0, total, message: "เตรียมข้อมูล" });
  const summary: ImportSummary = {
    added: 0, updated: 0, deleted: 0, failed: 0,
    costsSet: 0, pricesSet: 0, rows: [], errors: [],
  };

  // Load price groups (markup -> id)
  const { data: groups, error: ge } = await supabase
    .from("price_groups").select("id, markup_percent, is_custom");
  if (ge) { summary.errors.push(ge.message); return summary; }
  const groupByMarkup = new Map<number, string>();
  for (const g of groups ?? []) {
    if (!(g as any).is_custom) groupByMarkup.set(Number((g as any).markup_percent), (g as any).id);
  }

  // Load categories + resolve via shared helper (handles case/whitespace dedup)
  const { data: cats } = await supabase.from("categories").select("id, name");
  const { resolveCategories, mergeCreated, normalizeCategoryName } = await import("./categoryResolver");
  const allRawCatNames = rows.filter(r => r.action === "add").map(r => r.category ?? "");
  const resolved = resolveCategories(allRawCatNames, (cats ?? []) as any);
  if (resolved.toCreate.length) {
    const { data: ins, error: ie } = await supabase
      .from("categories")
      .insert(resolved.toCreate.map(name => ({ name })))
      .select("id, name");
    if (ie) { summary.errors.push(`สร้างหมวด: ${ie.message}`); }
    else { mergeCreated(resolved, allRawCatNames, (ins ?? []) as any); }
  }
  for (const w of resolved.warnings) summary.errors.push(`เตือน: ${w}`);
  function categoryIdFor(name?: string): string | null {
    if (!name) return null;
    const display = String(name).trim();
    if (!display) return null;
    // Try raw → then any key with matching normalized form
    if (resolved.map.has(display)) return resolved.map.get(display)!;
    const key = normalizeCategoryName(display);
    for (const [k, v] of resolved.map) if (normalizeCategoryName(k) === key) return v;
    return null;
  }

  // 1. deletes
  const delRows = rows.filter(r => r.action === "delete");
  if (delRows.length) {
    emit({ stage: "delete", done: 0, total, message: `กำลังลบ ${delRows.length} รายการ` });
    const delCodes = delRows.map(r => r.code);
    const { error, count } = await supabase.from("products").delete({ count: "exact" }).in("code", delCodes);
    if (error) {
      summary.errors.push(`ลบ: ${error.message}`);
      for (const r of delRows) {
        summary.rows.push({ row: r._row ?? 0, code: r.code, action: "delete", status: "failed", message: error.message, mode: "delete" });
        summary.failed++;
      }
    } else {
      summary.deleted = count ?? delCodes.length;
      for (const r of delRows) {
        summary.rows.push({ row: r._row ?? 0, code: r.code, action: "delete", status: "success", mode: "delete" });
      }
    }
  }
  let processed = delRows.length;
  emit({ stage: "upsert", done: processed, total, message: "กำลังเพิ่ม/อัปเดต" });

  // 2. adds/updates — dedupe by code (keep last occurrence), then lookup+update or insert
  const addRowsRaw = rows.filter(r => r.action === "add");
  const byCode = new Map<string, ImportRow>();
  const dupSeen = new Set<string>();
  for (const r of addRowsRaw) {
    if (byCode.has(r.code)) dupSeen.add(r.code);
    byCode.set(r.code, r);
  }
  for (const c of dupSeen) {
    summary.errors.push(`${c}: พบ code ซ้ำในไฟล์ — ใช้แถวล่างสุด`);
  }
  const addRows = Array.from(byCode.values());

  // Pre-fetch existing products by code to avoid ON CONFLICT entirely
  const existingMap = new Map<string, string>();
  if (addRows.length) {
    const codes = addRows.map(r => r.code);
    const { data: existing, error: exErr } = await supabase
      .from("products").select("id, code").in("code", codes);
    if (exErr) { summary.errors.push(`โหลดสินค้าเดิม: ${exErr.message}`); return summary; }
    for (const p of existing ?? []) existingMap.set((p as any).code, (p as any).id);
  }

  for (const r of addRows) {
    const category_id = categoryIdFor(r.category);
    const payload: any = {
      code: r.code,
      name: r.name || r.code,
      unit: r.unit || "ชิ้น",
      active: true,
    };
    if (category_id) payload.category_id = category_id;
    if (r.stock != null) payload.stock = r.stock;
    if (r.standard_price != null) payload.standard_price = r.standard_price;

    let pid = existingMap.get(r.code);
    let mode: "insert" | "update" = pid ? "update" : "insert";
    if (pid) {
      const { error } = await supabase.from("products").update(payload).eq("id", pid);
      if (error) {
        summary.errors.push(`${r.code}: ${error.message}`);
        summary.rows.push({ row: r._row ?? 0, code: r.code, action: "add", status: "failed", message: error.message, mode });
        summary.failed++;
        continue;
      }
      summary.updated++;
    } else {
      const { data: ins, error } = await supabase
        .from("products").insert(payload).select("id").single();
      if (error) {
        summary.errors.push(`${r.code}: ${error.message}`);
        summary.rows.push({ row: r._row ?? 0, code: r.code, action: "add", status: "failed", message: error.message, mode });
        summary.failed++;
        continue;
      }
      pid = (ins as any).id;
      existingMap.set(r.code, pid!);
      summary.added++;
    }

    let costSet = false;
    let pricesSet = 0;
    const partials: string[] = [];

    if (r.cost_price != null) {
      const { error: ce } = await supabase.rpc("admin_set_cost", { p_product_id: pid, p_cost: r.cost_price } as any);
      if (ce) { summary.errors.push(`${r.code} cost: ${ce.message}`); partials.push(`cost: ${ce.message}`); }
      else { summary.costsSet++; costSet = true; }
    }

    for (const [field, markup] of [["price_10", 10], ["price_15", 15], ["price_20", 20]] as const) {
      const v = r[field];
      if (v == null) continue;
      const gid = groupByMarkup.get(markup);
      if (!gid) {
        summary.errors.push(`${r.code}: ไม่พบกลุ่มราคา +${markup}%`);
        partials.push(`${field}: ไม่พบกลุ่ม +${markup}%`);
        continue;
      }
      const { error: pe } = await supabase.rpc("admin_set_group_price", {
        p_product_id: pid, p_group_id: gid, p_price: v,
      } as any);
      if (pe) { summary.errors.push(`${r.code} ${field}: ${pe.message}`); partials.push(`${field}: ${pe.message}`); }
      else { summary.pricesSet++; pricesSet++; }
    }

    summary.rows.push({
      row: r._row ?? 0, code: r.code, action: "add",
      status: partials.length ? "success" : "success",
      message: partials.length ? `บางส่วนพลาด: ${partials.join("; ")}` : undefined,
      costSet, pricesSet, mode,
    });
    processed++;
    if (processed % 5 === 0) {
      emit({ stage: "upsert", done: processed, total });
      await yieldNow();
    }
  }
  emit({ stage: "done", done: total, total });
  return summary;
}

/** SHA-256 hex of a file, using Web Crypto. */
export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Build CSV string from row results for download. */
export function rowResultsToCSV(results: RowResult[]): string {
  const header = ["row", "code", "action", "mode", "status", "costSet", "pricesSet", "message"];
  const lines = [header.join(",")];
  for (const r of results) {
    lines.push([
      r.row, r.code, r.action, r.mode ?? "", r.status,
      r.costSet ? "yes" : "", r.pricesSet ?? "",
      csvEsc(r.message ?? ""),
    ].join(","));
  }
  return "\uFEFF" + lines.join("\n") + "\n";
}
function csvEsc(s: string) {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}