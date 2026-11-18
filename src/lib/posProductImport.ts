import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { coerceRatio, validateLinkInput, LINK_ERROR_MESSAGES_TH } from "@/lib/productUnitLink";

/**
 * POS bulk-import library.
 * Reads/writes the SAME public.products table as /admin/products and /pos/stock.
 * Two template variants: "general" and "barcode".
 * Barcode is preserved as text so leading zeros survive.
 */

export type BarcodeMode = 1 | 2 | null;

export type PosImportRow = {
  _row: number;
  code: string;
  name: string;
  category: string;
  stock: number | null;
  unit: string;
  cost_price: number | null;
  standard_price: number | null;
  barcode_mode: BarcodeMode;
  barcode: string;
  low_stock_threshold: number | null;
  description: string;
  /** Optional linked-unit: this row is a wrapper linked to a base by base_code. */
  base_code: string;
  /** Positive integer ratio; only used when base_code is present. */
  base_ratio: number | null;
};

export type PosImportStatus = "ok" | "warning" | "error";

export type PosImportRowReport = {
  row: PosImportRow;
  status: PosImportStatus;
  errors: string[];
  warnings: string[];
  matchProductId?: string | null;
};

export type PosImportReport = {
  rows: PosImportRowReport[];
  totals: { total: number; valid: number; error: number; duplicate: number };
};

export const POS_TEMPLATE_HEADERS = [
  "รหัสสินค้า",
  "ชื่อสินค้า",
  "หมวดหมู่",
  "จำนวน",
  "หน่วยนับ",
  "ต้นทุน",
  "ราคาขาย",
  "รูปแบบบาร์โค้ด (1 หรือ 2)",
  "รหัสบาร์โค้ด",
  "จุดเตือนสต๊อกต่ำ",
  "รายละเอียด",
  "รหัสสินค้าหน่วยเล็ก",
  "อัตราส่วนต่อหน่วยใหญ่",
];

const CANONICAL_KEYS = [
  "code","name","category","stock","unit","cost_price",
  "standard_price","barcode_mode","barcode","low_stock_threshold","description",
  "base_code","base_ratio",
] as const;
type CanonicalKey = (typeof CANONICAL_KEYS)[number];

const HEADER_ALIASES: Record<string, CanonicalKey> = {
  "รหัสสินค้า": "code", "code": "code",
  "ชื่อสินค้า": "name", "name": "name",
  "หมวดหมู่": "category", "category": "category",
  "จำนวน": "stock", "สต๊อก": "stock", "stock": "stock",
  "หน่วยนับ": "unit", "หน่วย": "unit", "unit": "unit",
  "ต้นทุน": "cost_price", "ราคาทุน": "cost_price", "cost_price": "cost_price",
  "ราคาขาย": "standard_price", "ราคา": "standard_price", "standard_price": "standard_price",
  "รูปแบบบาร์โค้ด (1 หรือ 2)": "barcode_mode",
  "รูปแบบบาร์โค้ด": "barcode_mode", "barcode_mode": "barcode_mode",
  "รหัสบาร์โค้ด": "barcode", "barcode": "barcode",
  "จุดเตือนสต๊อกต่ำ": "low_stock_threshold", "low_stock_threshold": "low_stock_threshold",
  "รายละเอียด": "description", "description": "description",
  "รหัสสินค้าหน่วยเล็ก": "base_code", "base_code": "base_code",
  "อัตราส่วนต่อหน่วยใหญ่": "base_ratio", "base_ratio": "base_ratio",
};

function normHeader(v: any): CanonicalKey | null {
  const s = String(v ?? "").trim();
  return HEADER_ALIASES[s] ?? HEADER_ALIASES[s.toLowerCase()] ?? null;
}
function toNum(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function toStr(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}
function toBarcodeMode(v: any): BarcodeMode {
  const s = toStr(v);
  if (s === "" || s === "0") return null;
  if (s === "1") return 1;
  if (s === "2") return 2;
  const n = Number(s);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return null;
}

export type TemplateVariant = "general" | "barcode";
export type SkuTemplateVariant = "sku";
export type AnyTemplateVariant = TemplateVariant | SkuTemplateVariant;

/* =========================================================================
 *  SKU / VARIANT IMPORT (Stage 3)
 *  Uses canonical public.products + public.product_variants tables and the
 *  Stage-1 enable_product_variants RPC. No duplicate POS tables.
 * ========================================================================= */

export const POS_SKU_TEMPLATE_HEADERS = [
  "รหัสสินค้าหลัก",
  "ชื่อสินค้าหลัก",
  "SKU",
  "คุณสมบัติ1", "ค่า1",
  "คุณสมบัติ2", "ค่า2",
  "คุณสมบัติ3", "ค่า3",
  "บาร์โค้ดตัวเลือก",
  "สต๊อกตัวเลือก",
  "ต้นทุนตัวเลือก",
  "ราคาตัวเลือก",
  "จุดเตือนตัวเลือก",
  "สถานะ",
];

type SkuKey =
  | "parent_code" | "parent_name" | "sku"
  | "attr1_name" | "attr1_value"
  | "attr2_name" | "attr2_value"
  | "attr3_name" | "attr3_value"
  | "v_barcode" | "v_stock" | "v_cost" | "v_price" | "v_threshold" | "v_status";

const SKU_HEADER_ALIASES: Record<string, SkuKey> = {
  "รหัสสินค้าหลัก": "parent_code", "parent_code": "parent_code",
  "ชื่อสินค้าหลัก": "parent_name", "parent_name": "parent_name",
  "sku": "sku", "SKU": "sku",
  "คุณสมบัติ1": "attr1_name", "ค่า1": "attr1_value",
  "คุณสมบัติ2": "attr2_name", "ค่า2": "attr2_value",
  "คุณสมบัติ3": "attr3_name", "ค่า3": "attr3_value",
  "บาร์โค้ดตัวเลือก": "v_barcode",
  "สต๊อกตัวเลือก": "v_stock",
  "ต้นทุนตัวเลือก": "v_cost",
  "ราคาตัวเลือก": "v_price",
  "จุดเตือนตัวเลือก": "v_threshold",
  "สถานะ": "v_status",
};

function normSkuHeader(v: any): SkuKey | null {
  const s = String(v ?? "").trim();
  return SKU_HEADER_ALIASES[s] ?? SKU_HEADER_ALIASES[s.toLowerCase()] ?? null;
}

export type PosSkuVariantRow = {
  _row: number;
  parent_code: string;
  parent_name: string;
  sku: string;
  attrs: Array<{ name: string; value: string }>;
  barcode: string;
  stock: number | null;
  cost: number | null;
  price: number | null;
  low_stock_threshold: number | null;
  active: boolean;
};

export type PosSkuRowReport = {
  row: PosSkuVariantRow;
  status: PosImportStatus;
  errors: string[];
  warnings: string[];
};

export type PosSkuParentGroup = {
  parent_code: string;
  parent_name: string;
  variants: PosSkuRowReport[];
  status: PosImportStatus;
  errors: string[];
  existingProductId?: string | null;
  existingHasVariants?: boolean;
  attributeOrder: string[]; // canonical attribute names for this parent
};

export type PosSkuReport = {
  groups: PosSkuParentGroup[];
  totals: {
    parents: number;
    variants: number;
    valid: number;
    error: number;
    duplicate: number;
  };
};

export type ExistingParentSku = {
  id: string;
  code: string | null;
  has_variants: boolean;
  variants: Array<{ id: string; sku: string | null; barcode: string | null; attributes: Record<string, string> }>;
};

export type SkuValidateOpts = {
  mode: "create" | "edit";
  existingParents: ExistingParentSku[];
  existingBarcodes: Set<string>; // lowercase barcodes across DB (product+variant)
};

export function buildPosSkuTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const info: any[][] = [
    ["คู่มือเทมเพลตนำเข้าสินค้าแบบ SKU (Nattaporn POS)"],
    [],
    ["SKU vs บาร์โค้ด (โปรดอ่านก่อนใช้)"],
    ["SKU", "รหัสตัวเลือกสินค้า ใช้ภายในร้าน (เช่น POST-Y-S) — ต้องไม่ซ้ำภายใต้สินค้าหลักเดียวกัน"],
    ["บาร์โค้ดตัวเลือก", "เลขบาร์โค้ดจริงสำหรับสแกน — ต้องไม่ซ้ำทั้งระบบ และเก็บเป็นข้อความ (รักษา 0 นำหน้า)"],
    ["สินค้าหลัก", "สินค้าตัวแม่ (Post-it) มีตัวเลือกย่อย (สี×ขนาด) แต่ละแถวคือ 1 ตัวเลือก"],
    [],
    ["หัวคอลัมน์", "ความหมาย", "จำเป็น", "หมายเหตุ"],
    ["รหัสสินค้าหลัก", "รหัสสินค้าตัวแม่", "บังคับ", "ทุกแถวของ Post-it ใช้รหัสเดียวกัน"],
    ["ชื่อสินค้าหลัก", "ชื่อสินค้าตัวแม่", "บังคับเมื่อสร้างใหม่", "แถวเดียวกันของกลุ่มควรมีชื่อเดียวกัน"],
    ["SKU", "รหัสตัวเลือก (ไม่ซ้ำในสินค้าหลักเดียวกัน)", "บังคับ", "-"],
    ["คุณสมบัติ1..3", "ชื่อคุณสมบัติ เช่น สี, ขนาด", "อย่างน้อย 1 คู่", "ห้ามเว้น 'ค่า' โดยที่กรอก 'คุณสมบัติ'"],
    ["ค่า1..3", "ค่าของคุณสมบัตินั้น", "คู่กับคุณสมบัติ", "-"],
    ["บาร์โค้ดตัวเลือก", "บาร์โค้ดของตัวเลือก", "ไม่บังคับ", "รักษาเลข 0 นำหน้า"],
    ["สต๊อกตัวเลือก", "จำนวนคงเหลือของตัวเลือก", "ไม่บังคับ", "ตัวเลข >= 0 (ค่าเริ่มต้น 0)"],
    ["ต้นทุนตัวเลือก", "ต้นทุนเฉพาะตัวเลือก", "ไม่บังคับ", "เว้นว่าง = ใช้ค่าของสินค้าหลัก"],
    ["ราคาตัวเลือก", "ราคาขายเฉพาะตัวเลือก", "ไม่บังคับ", "เว้นว่าง = ใช้ราคาสินค้าหลัก"],
    ["จุดเตือนตัวเลือก", "จุดเตือนสต๊อกต่ำ", "ไม่บังคับ", "-"],
    ["สถานะ", "active | archived", "ไม่บังคับ", "ค่าเริ่มต้น active"],
    [],
    ["ตัวอย่าง: Post-it 3 ขนาด × 4 สี = 12 ตัวเลือก"],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  (wsInfo as any)["!cols"] = [{ wch: 24 }, { wch: 52 }, { wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "คำแนะนำ");

  const sizes = ["S", "M", "L"];
  const colors = ["เหลือง", "ชมพู", "ฟ้า", "เขียว"];
  const examples: any[][] = [];
  for (const s of sizes) {
    for (const c of colors) {
      examples.push([
        "POSTIT-01", "Post-it กระดาษโน้ต",
        `PT-${s}-${c.slice(0, 1)}`,
        "ขนาด", s, "สี", c, "", "",
        "", 20, "", "", 5, "active",
      ]);
    }
  }
  const data: any[][] = [POS_SKU_TEMPLATE_HEADERS, ...examples];
  for (let i = 0; i < 20; i++) {
    data.push(new Array(POS_SKU_TEMPLATE_HEADERS.length).fill(""));
  }
  const wsData = XLSX.utils.aoa_to_sheet(data);
  (wsData as any)["!cols"] = POS_SKU_TEMPLATE_HEADERS.map(() => ({ wch: 16 }));
  // Force barcode column to text so leading zero survives
  const range = XLSX.utils.decode_range((wsData as any)["!ref"]);
  const bcCol = POS_SKU_TEMPLATE_HEADERS.indexOf("บาร์โค้ดตัวเลือก");
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: bcCol });
    const cell = (wsData as any)[addr];
    if (cell && cell.v != null && cell.v !== "") {
      cell.t = "s"; cell.v = String(cell.v); cell.z = "@";
    }
  }
  XLSX.utils.book_append_sheet(wb, wsData, "Variants");
  return wb;
}

export function downloadPosSkuTemplate(): void {
  const wb = buildPosSkuTemplateWorkbook();
  XLSX.writeFile(wb, "เทมเพลตสินค้า-POS-SKU.xlsx");
}

/** Detects if an xlsx file is an SKU template based on header row. */
export async function detectPosImportKind(file: File): Promise<"sku" | "normal" | "unknown"> {
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
    const sheetName =
      wb.SheetNames.find((n) => n.toLowerCase() === "variants") ??
      wb.SheetNames.find((n) => n.toLowerCase() === "products") ??
      wb.SheetNames.find((n) => n !== "คำแนะนำ") ??
      wb.SheetNames[0];
    const ws = wb.Sheets[sheetName!];
    if (!ws) return "unknown";
    const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false });
    if (!aoa.length) return "unknown";
    const headers = (aoa[0] as any[]).map((v) => String(v ?? "").trim());
    if (headers.includes("SKU") && headers.includes("คุณสมบัติ1") && headers.includes("รหัสสินค้าหลัก")) {
      return "sku";
    }
    if (headers.includes("ชื่อสินค้า")) return "normal";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function parsePosSkuImportFile(
  file: File,
): Promise<{ rows: PosSkuVariantRow[]; fatal: string[] }> {
  const fatal: string[] = [];
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
  } catch (e: any) {
    return { rows: [], fatal: [e?.message || "อ่านไฟล์ไม่สำเร็จ"] };
  }
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "variants") ??
    wb.SheetNames.find((n) => n !== "คำแนะนำ") ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName!];
  if (!ws) return { rows: [], fatal: ["ไม่พบชีตข้อมูลในไฟล์"] };

  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "", raw: false });
  if (!aoa.length) return { rows: [], fatal: ["ไฟล์ว่าง"] };
  const header = aoa[0].map(normSkuHeader);
  const need: SkuKey[] = ["parent_code", "sku", "attr1_name", "attr1_value"];
  for (const k of need) {
    if (!header.includes(k)) {
      fatal.push(`ไฟล์ไม่ตรงเทมเพลต SKU — ไม่พบคอลัมน์ที่จำเป็น`);
      return { rows: [], fatal };
    }
  }

  const rows: PosSkuVariantRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i] ?? [];
    const rec: Partial<Record<SkuKey, any>> = {};
    header.forEach((k, idx) => { if (k) rec[k] = line[idx]; });
    const pcode = toStr(rec.parent_code);
    const sku = toStr(rec.sku);
    if (!pcode && !sku) continue;
    const attrs: Array<{ name: string; value: string }> = [];
    for (const [nk, vk] of [
      ["attr1_name", "attr1_value"],
      ["attr2_name", "attr2_value"],
      ["attr3_name", "attr3_value"],
    ] as const) {
      const nm = toStr((rec as any)[nk]);
      const va = toStr((rec as any)[vk]);
      if (nm || va) attrs.push({ name: nm, value: va });
    }
    const statusRaw = toStr(rec.v_status).toLowerCase();
    const active = statusRaw === "" || statusRaw === "active" || statusRaw === "ใช้งาน";
    rows.push({
      _row: i + 1,
      parent_code: pcode,
      parent_name: toStr(rec.parent_name),
      sku,
      attrs,
      barcode: toStr(rec.v_barcode),
      stock: toNum(rec.v_stock),
      cost: toNum(rec.v_cost),
      price: toNum(rec.v_price),
      low_stock_threshold: toNum(rec.v_threshold),
      active,
    });
  }
  return { rows, fatal };
}

function attrCombinationKey(attrs: Array<{ name: string; value: string }>): string {
  return attrs
    .map((a) => `${a.name.trim().toLowerCase()}=${a.value.trim().toLowerCase()}`)
    .join("||");
}

export function validatePosSkuRows(
  rows: PosSkuVariantRow[],
  opts: SkuValidateOpts,
): PosSkuReport {
  const parentByCode = new Map<string, ExistingParentSku>();
  for (const p of opts.existingParents) {
    if (p.code) parentByCode.set(p.code.toLowerCase(), p);
  }

  // group rows by parent_code
  const groups = new Map<string, PosSkuParentGroup>();
  const seenBarcodesInFile = new Map<string, number>();
  let duplicates = 0;

  for (const r of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.parent_code) errors.push("ต้องระบุ 'รหัสสินค้าหลัก'");
    if (!r.sku) errors.push("ต้องระบุ 'SKU'");

    // Attribute gap validation
    if (r.attrs.length === 0) errors.push("ต้องระบุคุณสมบัติอย่างน้อย 1 คู่");
    for (let i = 0; i < r.attrs.length; i++) {
      const a = r.attrs[i];
      if (!a.name || !a.value) errors.push(`คุณสมบัติที่ ${i + 1} ต้องมีทั้งชื่อและค่า`);
    }
    if (r.attrs.length > 3) errors.push("รองรับคุณสมบัติสูงสุด 3 คู่");

    for (const [k, label] of [
      ["stock", "สต๊อกตัวเลือก"],
      ["cost", "ต้นทุนตัวเลือก"],
      ["price", "ราคาตัวเลือก"],
      ["low_stock_threshold", "จุดเตือนตัวเลือก"],
    ] as const) {
      const v = (r as any)[k] as number | null;
      if (v != null && (!Number.isFinite(v) || v < 0)) errors.push(`${label} ต้องเป็นตัวเลข >= 0`);
    }

    if (r.barcode) {
      const bkey = r.barcode.toLowerCase();
      const prev = seenBarcodesInFile.get(bkey);
      if (prev != null) { errors.push(`บาร์โค้ดซ้ำในไฟล์กับแถวที่ ${prev}`); duplicates++; }
      else seenBarcodesInFile.set(bkey, r._row);
      if (opts.existingBarcodes.has(bkey)) {
        // OK if edit-mode update of same variant; validated later per-group. Warn here.
        // Handled group-level for accuracy; keep global marker.
      }
    }

    const pkey = r.parent_code.toLowerCase();
    let g = groups.get(pkey);
    if (!g) {
      const existing = parentByCode.get(pkey) ?? null;
      g = {
        parent_code: r.parent_code,
        parent_name: r.parent_name,
        variants: [],
        status: "ok",
        errors: [],
        existingProductId: existing?.id ?? null,
        existingHasVariants: existing?.has_variants ?? false,
        attributeOrder: r.attrs.map((a) => a.name.trim()),
      };
      groups.set(pkey, g);
    } else if (r.parent_name && g.parent_name && r.parent_name !== g.parent_name) {
      warnings.push("ชื่อสินค้าหลักไม่ตรงกับแถวก่อนหน้าของกลุ่มเดียวกัน");
    }

    g.variants.push({
      row: r,
      status: errors.length ? "error" : warnings.length ? "warning" : "ok",
      errors,
      warnings,
    });
  }

  // Per-group checks: canonical attribute order, dup combinations, dup SKU within parent,
  // parent existence rules per mode, and DB variant SKU/barcode collisions.
  for (const g of groups.values()) {
    const gErrors: string[] = [];
    const skuSeen = new Map<string, number>();
    const comboSeen = new Map<string, number>();

    for (const v of g.variants) {
      if (v.status === "error") continue;
      // Canonical attribute names (ordered set) must match first row
      const namesHere = v.row.attrs.map((a) => a.name.trim());
      if (
        namesHere.length !== g.attributeOrder.length ||
        namesHere.some((n, i) => n !== g.attributeOrder[i])
      ) {
        v.errors.push("ชุดคุณสมบัติของแถวนี้ไม่ตรงกับกลุ่มเดียวกัน");
        v.status = "error";
        continue;
      }
      const sk = v.row.sku.toLowerCase();
      const prev = skuSeen.get(sk);
      if (prev != null) { v.errors.push(`SKU ซ้ำในกลุ่มกับแถวที่ ${prev}`); v.status = "error"; duplicates++; }
      else skuSeen.set(sk, v.row._row);
      const ck = attrCombinationKey(v.row.attrs);
      const prevC = comboSeen.get(ck);
      if (prevC != null) { v.errors.push(`ชุดค่าคุณสมบัติซ้ำกับแถวที่ ${prevC}`); v.status = "error"; duplicates++; }
      else comboSeen.set(ck, v.row._row);
    }

    const existing = parentByCode.get(g.parent_code.toLowerCase()) ?? null;
    if (opts.mode === "create") {
      if (existing && existing.has_variants) {
        // Retry safety: existing SKU-enabled parent → dedup already-present SKUs into warnings.
        const dbSkus = new Set(existing.variants.map((v) => (v.sku ?? "").toLowerCase()).filter(Boolean));
        for (const v of g.variants) {
          if (v.status === "error") continue;
          if (dbSkus.has(v.row.sku.toLowerCase())) {
            v.warnings.push("SKU นี้มีในระบบแล้ว จะข้ามเมื่อบันทึกซ้ำ");
            if (v.status === "ok") v.status = "warning";
          }
        }
      }
      if (!existing) {
        if (!g.parent_name || g.variants.every((v) => !v.row.parent_name)) {
          gErrors.push("ต้องระบุ 'ชื่อสินค้าหลัก' เมื่อสร้างสินค้าหลักใหม่");
        }
      }
    } else {
      // edit mode
      if (!existing) {
        gErrors.push("ไม่พบสินค้าหลักในระบบ (จับคู่ด้วยรหัสสินค้าหลัก)");
      } else if (!existing.has_variants) {
        gErrors.push("สินค้าหลักนี้ยังไม่ได้เปิดโหมด SKU");
      } else {
        const dbBySku = new Map(existing.variants.map((v) => [(v.sku ?? "").toLowerCase(), v]));
        for (const v of g.variants) {
          if (v.status === "error") continue;
          if (!dbBySku.has(v.row.sku.toLowerCase())) {
            v.errors.push("ไม่พบ SKU นี้ในสินค้าหลัก");
            v.status = "error";
          }
        }
      }
    }

    // DB barcode collision (skip when the barcode belongs to the same existing variant in edit mode)
    if (existing) {
      const ownBarcodes = new Set(existing.variants.map((v) => (v.barcode ?? "").toLowerCase()).filter(Boolean));
      for (const v of g.variants) {
        if (v.status === "error" || !v.row.barcode) continue;
        const bk = v.row.barcode.toLowerCase();
        if (opts.existingBarcodes.has(bk) && !ownBarcodes.has(bk)) {
          v.errors.push("บาร์โค้ดตัวเลือกนี้มีในระบบแล้ว");
          v.status = "error";
        }
      }
    } else {
      for (const v of g.variants) {
        if (v.status === "error" || !v.row.barcode) continue;
        if (opts.existingBarcodes.has(v.row.barcode.toLowerCase())) {
          v.errors.push("บาร์โค้ดตัวเลือกนี้มีในระบบแล้ว");
          v.status = "error";
        }
      }
    }

    g.errors = gErrors;
    const anyErr = gErrors.length > 0 || g.variants.some((v) => v.status === "error");
    const anyWarn = g.variants.some((v) => v.status === "warning");
    g.status = anyErr ? "error" : anyWarn ? "warning" : "ok";
    if (gErrors.length) {
      // Cascade group error to all rows for clear display
      for (const v of g.variants) {
        if (v.status !== "error") {
          v.errors.push(...gErrors);
          v.status = "error";
        }
      }
    }
  }

  const list = Array.from(groups.values());
  const totVariants = list.reduce((s, g) => s + g.variants.length, 0);
  const errCount = list.reduce(
    (s, g) => s + g.variants.filter((v) => v.status === "error").length,
    0,
  );
  return {
    groups: list,
    totals: {
      parents: list.length,
      variants: totVariants,
      valid: totVariants - errCount,
      error: errCount,
      duplicate: duplicates,
    },
  };
}

export async function loadExistingParentSkus(codes: string[]): Promise<ExistingParentSku[]> {
  const clean = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
  if (!clean.length) return [];
  const { data: parents, error } = await supabase
    .from("products")
    .select("id, code, has_variants")
    .in("code", clean)
    .is("deleted_at", null);
  if (error) throw error;
  const parentList = (parents ?? []) as Array<{ id: string; code: string | null; has_variants: boolean }>;
  if (!parentList.length) return [];
  const ids = parentList.map((p) => p.id);
  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, sku, barcode, attributes")
    .in("product_id", ids);
  if (vErr) throw vErr;
  const byPid = new Map<string, Array<{ id: string; sku: string | null; barcode: string | null; attributes: Record<string, string> }>>();
  for (const v of variants ?? []) {
    const arr = byPid.get((v as any).product_id) ?? [];
    arr.push({
      id: (v as any).id,
      sku: (v as any).sku,
      barcode: (v as any).barcode,
      attributes: ((v as any).attributes ?? {}) as Record<string, string>,
    });
    byPid.set((v as any).product_id, arr);
  }
  return parentList.map((p) => ({
    id: p.id,
    code: p.code,
    has_variants: !!p.has_variants,
    variants: byPid.get(p.id) ?? [],
  }));
}

export async function loadAllVariantBarcodes(): Promise<Set<string>> {
  const s = new Set<string>();
  const { data: prods } = await supabase.from("products").select("barcode").not("barcode", "is", null).limit(50000);
  for (const p of prods ?? []) {
    const b = (p as any).barcode;
    if (b) s.add(String(b).toLowerCase());
  }
  const { data: vars } = await supabase.from("product_variants").select("barcode").not("barcode", "is", null).limit(50000);
  for (const v of vars ?? []) {
    const b = (v as any).barcode;
    if (b) s.add(String(b).toLowerCase());
  }
  return s;
}

export type SkuCommitResult = {
  parentsCreated: number;
  parentsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  failedGroups: number;
  perGroup: Array<{
    parent_code: string;
    status: "success" | "failed" | "partial";
    message?: string;
    parentId?: string | null;
    variantsAffected?: number;
  }>;
};

function attrsToJson(attrs: Array<{ name: string; value: string }>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const a of attrs) if (a.name) o[a.name.trim()] = a.value.trim();
  return o;
}

export async function commitPosSkuImport(
  mode: "create" | "edit",
  report: PosSkuReport,
  onProgress?: (p: CommitProgress) => void,
): Promise<SkuCommitResult> {
  const result: SkuCommitResult = {
    parentsCreated: 0,
    parentsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    failedGroups: 0,
    perGroup: [],
  };
  const validGroups = report.groups.filter((g) => g.status !== "error");
  const total = validGroups.length;
  if (!total) return result;
  let done = 0;

  for (const g of validGroups) {
    const validVariants = g.variants.filter((v) => v.status !== "error");
    if (!validVariants.length) { done++; onProgress?.({ done, total }); continue; }
    try {
      let parentId = g.existingProductId ?? null;
      let alreadyEnabled = !!g.existingHasVariants;
      let existingSkus = new Set<string>();
      if (parentId) {
        // refresh existing variant SKUs at commit time
        const { data: currVars } = await supabase
          .from("product_variants").select("sku").eq("product_id", parentId);
        existingSkus = new Set((currVars ?? [])
          .map((v: any) => String(v.sku ?? "").toLowerCase()).filter(Boolean));
      }

      if (mode === "create") {
        if (!parentId) {
          const parentName = g.parent_name ||
            validVariants.map((v) => v.row.parent_name).find(Boolean) || g.parent_code;
          const { data, error } = await supabase.from("products").insert({
            code: g.parent_code,
            name: parentName,
            stock: 0,
            unit: "ชิ้น",
            standard_price: 0,
            active: true,
            has_variants: false,
          }).select("id, has_variants").single();
          if (error) throw error;
          parentId = (data as any).id;
          alreadyEnabled = false;
          result.parentsCreated++;
        } else {
          result.parentsUpdated++;
        }

        if (!alreadyEnabled) {
          const allocations = validVariants.map((v) => ({
            sku: v.row.sku,
            name: v.row.sku,
            barcode: v.row.barcode || null,
            attributes: attrsToJson(v.row.attrs),
            price: v.row.price ?? null,
            cost_override: v.row.cost ?? null,
            stock: v.row.stock ?? 0,
            low_stock_threshold: v.row.low_stock_threshold ?? null,
            active: v.row.active,
          }));
          const { error: rpcErr } = await supabase.rpc("enable_product_variants", {
            _product_id: parentId!,
            _allocations: allocations as any,
          });
          if (rpcErr) throw rpcErr;
          result.variantsCreated += allocations.length;
        } else {
          // insert only missing SKUs
          const inserts = validVariants
            .filter((v) => !existingSkus.has(v.row.sku.toLowerCase()))
            .map((v) => ({
              product_id: parentId!,
              sku: v.row.sku,
              name: v.row.sku,
              barcode: v.row.barcode || null,
              attributes: attrsToJson(v.row.attrs),
              price: v.row.price ?? null,
              cost_override: v.row.cost ?? null,
              stock: v.row.stock ?? 0,
              low_stock_threshold: v.row.low_stock_threshold ?? null,
              active: v.row.active,
            }));
          if (inserts.length) {
            const { error: insErr } = await supabase.from("product_variants").insert(inserts);
            if (insErr) throw insErr;
          }
          result.variantsCreated += inserts.length;
        }
        result.perGroup.push({
          parent_code: g.parent_code,
          status: "success",
          parentId,
          variantsAffected: validVariants.length,
        });
      } else {
        // edit mode: update existing variants only, matched by (parent, sku)
        if (!parentId) throw new Error("ไม่พบสินค้าหลัก");
        result.parentsUpdated++;
        const existingVariants = new Map<string, string>();
        {
          const { data } = await supabase
            .from("product_variants").select("id, sku").eq("product_id", parentId);
          for (const v of data ?? []) {
            existingVariants.set(String((v as any).sku ?? "").toLowerCase(), (v as any).id);
          }
        }
        for (const v of validVariants) {
          const vid = existingVariants.get(v.row.sku.toLowerCase());
          if (!vid) continue;
          const patch: any = {
            barcode: v.row.barcode || null,
            attributes: attrsToJson(v.row.attrs),
            price: v.row.price ?? null,
            cost_override: v.row.cost ?? null,
            stock: v.row.stock ?? 0,
            low_stock_threshold: v.row.low_stock_threshold ?? null,
            active: v.row.active,
          };
          const { error: uErr } = await supabase.from("product_variants").update(patch).eq("id", vid);
          if (uErr) throw uErr;
          result.variantsUpdated++;
        }
        result.perGroup.push({
          parent_code: g.parent_code,
          status: "success",
          parentId,
          variantsAffected: validVariants.length,
        });
      }
    } catch (e: any) {
      result.failedGroups++;
      result.perGroup.push({
        parent_code: g.parent_code,
        status: "failed",
        message: e?.message || "ผิดพลาด",
      });
    }
    done++;
    onProgress?.({ done, total });
  }
  return result;
}

export function buildSkuErrorReportCSV(report: PosSkuReport): string {
  const header = ["row", "parent_code", "sku", "status", "errors", "warnings"];
  const lines = [header.join(",")];
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  for (const g of report.groups) {
    for (const v of g.variants) {
      if (v.status === "ok") continue;
      lines.push([
        v.row._row,
        esc(g.parent_code),
        esc(v.row.sku),
        v.status,
        esc(v.errors.join(" | ")),
        esc(v.warnings.join(" | ")),
      ].join(","));
    }
  }
  return "\uFEFF" + lines.join("\n") + "\n";
}

export function buildPosTemplateWorkbook(variant: TemplateVariant): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const instructionsRows: any[][] = [
    ["คู่มือการใช้งานเทมเพลตนำเข้าสินค้า (Nattaporn POS)"],
    [],
    ["หัวคอลัมน์", "ความหมาย", "จำเป็น", "หมายเหตุ"],
    ["รหัสสินค้า", "รหัสภายในร้าน", "ไม่บังคับ", "เว้นว่างได้ ระบบจะสร้างให้อัตโนมัติ"],
    ["ชื่อสินค้า", "ชื่อที่แสดง", "บังคับ", "-"],
    ["หมวดหมู่", "ชื่อหมวดหมู่", "ไม่บังคับ", "ถ้ายังไม่มีระบบจะสร้างให้"],
    ["จำนวน", "สต๊อกเริ่มต้น", "ไม่บังคับ", "ตัวเลข >= 0"],
    ["หน่วยนับ", "เช่น ชิ้น/ด้าม/รีม", "ไม่บังคับ", "ค่าเริ่มต้น 'ชิ้น'"],
    ["ต้นทุน", "ราคาทุน (บาท)", "ไม่บังคับ", "ตัวเลข >= 0"],
    ["ราคาขาย", "ราคาขายหน้าร้าน (บาท)", "แนะนำ", "ตัวเลข >= 0"],
    ["รูปแบบบาร์โค้ด (1 หรือ 2)", "1 = ใช้รหัสสินค้าเป็นบาร์โค้ด, 2 = ใช้รหัสบาร์โค้ดโรงงาน",
     variant === "barcode" ? "บังคับเมื่อมีบาร์โค้ด" : "ไม่บังคับ", "เว้นว่าง = ไม่มีบาร์โค้ด"],
    ["รหัสบาร์โค้ด", "รหัสบาร์โค้ดจริง (เก็บเป็นข้อความ)", "บังคับเมื่อรูปแบบ = 2",
     "รักษาเลข 0 นำหน้า เช่น 088123..."],
    ["จุดเตือนสต๊อกต่ำ", "จำนวนที่ต่ำแล้วต้องแจ้งเตือน", "ไม่บังคับ", "ค่าเริ่มต้น 5"],
    ["รายละเอียด", "คำอธิบายสินค้า", "ไม่บังคับ", "-"],
    ["รหัสสินค้าหน่วยเล็ก", "รหัสสินค้าฐานสำหรับสินค้าห่อ/แพ็ค/ลัง", "ไม่บังคับ",
     "ต้องอยู่ในไฟล์เดียวกันหรือมีในระบบ; สต๊อกของสินค้าห่อจะคำนวณจากสินค้าหน่วยเล็ก"],
    ["อัตราส่วนต่อหน่วยใหญ่", "จำนวนหน่วยเล็กต่อ 1 หน่วยห่อ", "ไม่บังคับ",
     "จำนวนเต็มบวก เช่น 4 = 1 แพ็คมี 4 แท่ง"],
    [],
    ["โหมดบาร์โค้ด (สำคัญ)"],
    ["โหมด 1", "ใช้รหัสสินค้าเดียวกับบาร์โค้ด — ถ้าเว้นรหัส ระบบจะสร้างรหัสให้แล้วใช้ค่านั้นเป็นบาร์โค้ด"],
    ["โหมด 2", "ต้องใส่ 'รหัสบาร์โค้ด' เป็นตัวเลขจากผู้ผลิต (รักษาเลข 0 นำหน้า)"],
    ["เว้นว่าง", "สินค้านี้ไม่ผูกบาร์โค้ด"],
    [],
    ["สินค้าสัมพันธ์ (หน่วยห่อ → หน่วยเล็ก)"],
    ["ตัวอย่าง: PEN-BASE = แท่งเดี่ยว, PEN-PACK4 ผูก PEN-BASE ×4, PEN-CARTON40 ผูก PEN-BASE ×40"],
    ["ห้าม", "ผูกตัวเอง / ผูกซ้อนหลายชั้น (chain) / ผูกวน (cycle) / ผูกกับสินค้าที่มี SKU ย่อย"],
    [],
    ["ตัวอย่างข้อมูล"],
    ["- รหัสสินค้าซ้ำในไฟล์เดียวกันจะถูกปฏิเสธ"],
    ["- ในโหมด 'แก้ไขสินค้าที่มีอยู่' ระบบจะจับคู่ด้วย รหัสสินค้า ก่อน จากนั้นจึงเป็น รหัสบาร์โค้ด"],
    ["- แถวที่ผิดจะไม่ถูกนำเข้า สามารถโหลดรายงานความผิดพลาดกลับมาได้"],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructionsRows);
  (wsInfo as any)["!cols"] = [{ wch: 30 }, { wch: 50 }, { wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "คำแนะนำ");

  const examples: any[][] =
    variant === "barcode"
      ? [
          ["", "ปากกาเจล 0.5", "เครื่องเขียน", 100, "ด้าม", 4, 8, 2, "0881234567890", 10, "หมึกน้ำเงิน", "", ""],
          ["SKU-002", "สมุด A5 80 แผ่น", "เครื่องเขียน", 40, "เล่ม", 18, 30, 1, "", 5, "", "", ""],
        ]
      : [
          ["PEN-BASE", "ปากกาลูกลื่นน้ำเงิน (แท่ง)", "เครื่องเขียน", 100, "แท่ง", 4, 8, "", "", 10, "", "", ""],
          ["PEN-PACK4", "ปากกาลูกลื่นน้ำเงิน (แพ็ค 4)", "เครื่องเขียน", 0, "แพ็ค", 16, 30, "", "", 5, "", "PEN-BASE", 4],
          ["PEN-CARTON40", "ปากกาลูกลื่นน้ำเงิน (ลัง 40)", "เครื่องเขียน", 0, "ลัง", 140, 260, "", "", 2, "", "PEN-BASE", 40],
        ];
  const data: any[][] = [POS_TEMPLATE_HEADERS, ...examples];
  for (let i = 0; i < 30; i++) data.push(new Array(POS_TEMPLATE_HEADERS.length).fill(""));

  const wsData = XLSX.utils.aoa_to_sheet(data);
  (wsData as any)["!cols"] = [
    { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 40 },
    { wch: 20 }, { wch: 20 },
  ];
  const range = XLSX.utils.decode_range((wsData as any)["!ref"]);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 8 });
    const cell = (wsData as any)[addr];
    if (cell && cell.v != null && cell.v !== "") {
      cell.t = "s";
      cell.v = String(cell.v);
      cell.z = "@";
    }
  }
  XLSX.utils.book_append_sheet(wb, wsData, "Products");
  return wb;
}

export function downloadPosTemplate(variant: TemplateVariant): void {
  const wb = buildPosTemplateWorkbook(variant);
  const filename =
    variant === "barcode"
      ? "เทมเพลตสินค้า-POS-มีบาร์โค้ด.xlsx"
      : "เทมเพลตสินค้า-POS-ทั่วไป.xlsx";
  XLSX.writeFile(wb, filename);
}

export async function parsePosImportFile(
  file: File,
): Promise<{ rows: PosImportRow[]; fatal: string[] }> {
  const fatal: string[] = [];
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
  } catch (e: any) {
    return { rows: [], fatal: [e?.message || "อ่านไฟล์ไม่สำเร็จ"] };
  }
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase() === "products") ??
    wb.SheetNames.find((n) => n !== "คำแนะนำ") ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], fatal: ["ไม่พบชีตข้อมูลในไฟล์"] };
  const aoa = XLSX.utils.sheet_to_json<any[]>(ws, {
    header: 1, defval: "", raw: false,
  });
  if (!aoa.length) return { rows: [], fatal: ["ไฟล์ว่าง"] };

  const header = aoa[0].map(normHeader);
  if (!header.includes("name")) {
    fatal.push("ไฟล์ไม่ตรงเทมเพลต — ไม่พบคอลัมน์ 'ชื่อสินค้า' (name) กรุณาดาวน์โหลดเทมเพลตล่าสุด");
    return { rows: [], fatal };
  }

  const rows: PosImportRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const line = aoa[i] ?? [];
    const rec: Partial<Record<CanonicalKey, any>> = {};
    header.forEach((k, idx) => { if (k) rec[k] = line[idx]; });
    const name = toStr(rec.name);
    const code = toStr(rec.code);
    if (!name && !code && !toStr(rec.barcode)) continue;
    rows.push({
      _row: i + 1,
      code, name,
      category: toStr(rec.category),
      stock: toNum(rec.stock),
      unit: toStr(rec.unit) || "ชิ้น",
      cost_price: toNum(rec.cost_price),
      standard_price: toNum(rec.standard_price),
      barcode_mode: toBarcodeMode(rec.barcode_mode),
      barcode: toStr(rec.barcode),
      low_stock_threshold: toNum(rec.low_stock_threshold),
      description: toStr(rec.description),
      base_code: toStr(rec.base_code),
      base_ratio: toNum(rec.base_ratio),
    });
  }
  return { rows, fatal };
}

export type ExistingRef = { id: string; code: string | null; barcode: string | null };
export type ValidateOpts = { mode: "create" | "edit"; existing: ExistingRef[] };

export function validatePosRows(
  rows: PosImportRow[],
  opts: ValidateOpts,
): PosImportReport {
  const byCode = new Map<string, string>();
  const byBarcode = new Map<string, string>();
  for (const p of opts.existing) {
    if (p.code) byCode.set(p.code.toLowerCase(), p.id);
    if (p.barcode) byBarcode.set(p.barcode.toLowerCase(), p.id);
  }

  const seenCodes = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const report: PosImportRowReport[] = [];
  let duplicates = 0;

  for (const r of rows) {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.name) errors.push("ต้องระบุ 'ชื่อสินค้า'");

    for (const [k, label] of [
      ["stock", "จำนวน"],
      ["cost_price", "ต้นทุน"],
      ["standard_price", "ราคาขาย"],
      ["low_stock_threshold", "จุดเตือนสต๊อกต่ำ"],
    ] as const) {
      const v = (r as any)[k] as number | null;
      if (v != null && (!Number.isFinite(v) || v < 0)) errors.push(`${label} ต้องเป็นตัวเลข >= 0`);
    }

    const rawMode = r.barcode_mode;
    if (rawMode !== null && rawMode !== 1 && rawMode !== 2) {
      errors.push("รูปแบบบาร์โค้ดต้องเป็น 1 หรือ 2 หรือเว้นว่าง");
    }
    if (rawMode === 2 && !r.barcode) errors.push("โหมด 2 ต้องระบุ 'รหัสบาร์โค้ด'");
    if (rawMode === 1 && r.barcode && r.code && r.barcode !== r.code) {
      warnings.push("โหมด 1: รหัสบาร์โค้ดจะถูกทับด้วยรหัสสินค้า");
    }

    // Linked-unit column validation (only when either column is present)
    if (r.base_code || r.base_ratio != null) {
      if (!r.base_code) errors.push("ระบุ 'อัตราส่วนต่อหน่วยใหญ่' แต่ไม่ได้ระบุ 'รหัสสินค้าหน่วยเล็ก'");
      if (r.base_ratio == null) errors.push("ระบุ 'รหัสสินค้าหน่วยเล็ก' แต่ไม่ได้ระบุ 'อัตราส่วนต่อหน่วยใหญ่'");
      if (r.base_ratio != null && coerceRatio(r.base_ratio) == null) {
        errors.push(LINK_ERROR_MESSAGES_TH.ratio_must_be_positive_integer);
      }
      if (r.base_code && r.code && r.base_code.toLowerCase() === r.code.toLowerCase()) {
        errors.push(LINK_ERROR_MESSAGES_TH.self_link_forbidden);
      }
    }

    if (r.code) {
      const key = r.code.toLowerCase();
      const prev = seenCodes.get(key);
      if (prev != null) { errors.push(`รหัสสินค้าซ้ำในไฟล์กับแถวที่ ${prev}`); duplicates++; }
      else seenCodes.set(key, r._row);
    }
    if (r.barcode) {
      const bkey = r.barcode.toLowerCase();
      const prev = seenBarcodes.get(bkey);
      if (prev != null) { errors.push(`รหัสบาร์โค้ดซ้ำในไฟล์กับแถวที่ ${prev}`); duplicates++; }
      else seenBarcodes.set(bkey, r._row);
    }

    let matchId: string | null = null;
    if (opts.mode === "create") {
      if (r.code && byCode.has(r.code.toLowerCase())) errors.push("มีรหัสสินค้านี้ในระบบแล้ว");
      if (r.barcode && byBarcode.has(r.barcode.toLowerCase())) errors.push("มีรหัสบาร์โค้ดนี้ในระบบแล้ว");
    } else {
      if (r.code && byCode.has(r.code.toLowerCase())) matchId = byCode.get(r.code.toLowerCase())!;
      else if (r.barcode && byBarcode.has(r.barcode.toLowerCase())) matchId = byBarcode.get(r.barcode.toLowerCase())!;
      else errors.push("ไม่พบสินค้าที่ตรงกันในระบบ (จับคู่ด้วยรหัสสินค้า/บาร์โค้ด)");
    }

    const status: PosImportStatus = errors.length ? "error" : warnings.length ? "warning" : "ok";
    report.push({ row: r, status, errors, warnings, matchProductId: matchId });
  }

  const total = report.length;
  const errorCount = report.filter((r) => r.status === "error").length;

  // ----- Second pass: cross-row linked-unit validation (base existence, chain, cycle) -----
  // We use the file's rows + existing DB rows to reject:
  //   - unknown base_code
  //   - self link
  //   - chain (base_code refers to a row/product that itself has a base)
  //   - promotion (this wrapper is used elsewhere as a base)
  const rowByCode = new Map<string, PosImportRowReport>();
  for (const rr of report) if (rr.row.code) rowByCode.set(rr.row.code.toLowerCase(), rr);
  const existingWithBase = new Set<string>(); // codes of DB products that already have a base
  // We can't reliably know that from validate context (no DB fetch here); commit re-validates on the server.
  for (const rr of report) {
    const r = rr.row;
    if (!r.base_code || r.base_ratio == null) continue;
    const baseKey = r.base_code.toLowerCase();
    const fileBase = rowByCode.get(baseKey);
    const dbBase = byCode.get(baseKey);
    if (!fileBase && !dbBase) {
      rr.errors.push("ไม่พบ 'รหัสสินค้าหน่วยเล็ก' ในไฟล์นี้หรือในระบบ");
      rr.status = "error";
      continue;
    }
    // no chain: the referenced base row must not itself have a base_code
    if (fileBase && fileBase.row.base_code) {
      rr.errors.push(LINK_ERROR_MESSAGES_TH.base_is_itself_a_wrapper_no_chain);
      rr.status = "error";
    }
    // no promotion: this wrapper's own code must not be someone else's base_code inside the file
    if (r.code) {
      for (const other of report) {
        if (other === rr) continue;
        if (other.row.base_code && other.row.base_code.toLowerCase() === r.code.toLowerCase()) {
          rr.errors.push(LINK_ERROR_MESSAGES_TH.wrapper_is_already_base_of_other_wrapper);
          rr.status = "error";
          break;
        }
      }
    }
  }
  const errorCount2 = report.filter((r) => r.status === "error").length;
  return {
    rows: report,
    totals: { total, valid: total - errorCount2, error: errorCount2, duplicate: duplicates },
  };
}

export async function generateUniqueProductCode(taken: Set<string>): Promise<string> {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  for (let i = 0; i < 999; i++) {
    const rand = Math.floor(Math.random() * 9000 + 1000);
    const code = `POS-${y}${m}${d}-${rand}`;
    if (!taken.has(code.toLowerCase())) { taken.add(code.toLowerCase()); return code; }
  }
  return `POS-${Date.now()}`;
}

export type CommitProgress = { done: number; total: number; message?: string };
export type CommitResult = {
  imported: number;
  failed: number;
  perRow: Array<{ row: number; status: "success" | "failed"; message?: string; productId?: string }>;
};

export async function loadExistingProductRefs(): Promise<ExistingRef[]> {
  const { data, error } = await supabase
    .from("products").select("id, code, barcode")
    .is("deleted_at", null).limit(20000);
  if (error) throw error;
  return (data ?? []) as ExistingRef[];
}

async function ensureCategoryMap(rows: PosImportRow[]): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(rows.map((r) => r.category.trim()).filter(Boolean)));
  const map = new Map<string, string>();
  if (!wanted.length) return map;
  const { data: existing } = await supabase.from("categories").select("id, name");
  for (const c of existing ?? []) {
    map.set(String((c as any).name).trim().toLowerCase(), (c as any).id);
  }
  const missing = wanted.filter((n) => !map.has(n.toLowerCase()));
  if (missing.length) {
    const { data: created, error } = await supabase.from("categories")
      .insert(missing.map((name) => ({ name }))).select("id, name");
    if (error) throw error;
    for (const c of created ?? []) {
      map.set(String((c as any).name).trim().toLowerCase(), (c as any).id);
    }
  }
  return map;
}

export async function commitPosImport(
  mode: "create" | "edit",
  report: PosImportReport,
  onProgress?: (p: CommitProgress) => void,
): Promise<CommitResult> {
  const valid = report.rows.filter((r) => r.status !== "error");
  const total = valid.length;
  const result: CommitResult = { imported: 0, failed: 0, perRow: [] };
  if (!total) return result;

  const rows = valid.map((r) => r.row);
  const catMap = await ensureCategoryMap(rows);
  const existing = await loadExistingProductRefs();
  const takenCodes = new Set<string>();
  for (const p of existing) if (p.code) takenCodes.add(p.code.toLowerCase());
  for (const r of rows) if (r.code) takenCodes.add(r.code.toLowerCase());

  let done = 0;
  for (const entry of valid) {
    const r = entry.row;
    try {
      let finalCode = r.code;
      if (!finalCode && mode === "create") {
        finalCode = await generateUniqueProductCode(takenCodes);
      }
      let finalBarcode: string | null = null;
      if (r.barcode_mode === 1) finalBarcode = finalCode || null;
      else if (r.barcode_mode === 2) finalBarcode = r.barcode || null;
      else if (r.barcode) finalBarcode = r.barcode;

      const catId = r.category ? catMap.get(r.category.trim().toLowerCase()) ?? null : null;
      const payload: any = {
        code: finalCode || null,
        name: r.name,
        category_id: catId,
        stock: r.stock ?? 0,
        unit: r.unit || "ชิ้น",
        standard_price: r.standard_price ?? 0,
        barcode: finalBarcode,
        low_stock_threshold: r.low_stock_threshold ?? 5,
        description: r.description || null,
        active: true,
      };

      if (mode === "create") {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        const pid = (data as any).id as string;
        if (r.cost_price != null && r.cost_price > 0) {
          await supabase.from("product_costs")
            .upsert({ product_id: pid, cost_price: r.cost_price }, { onConflict: "product_id" });
        }
        result.perRow.push({ row: r._row, status: "success", productId: pid });
        result.imported++;
      } else {
        const pid = entry.matchProductId;
        if (!pid) throw new Error("ไม่พบสินค้าที่จับคู่");
        const { error } = await supabase.from("products").update(payload).eq("id", pid);
        if (error) throw error;
        if (r.cost_price != null && r.cost_price > 0) {
          await supabase.from("product_costs")
            .upsert({ product_id: pid, cost_price: r.cost_price }, { onConflict: "product_id" });
        }
        result.perRow.push({ row: r._row, status: "success", productId: pid });
        result.imported++;
      }
    } catch (e: any) {
      result.failed++;
      result.perRow.push({ row: r._row, status: "failed", message: e?.message || "ผิดพลาด" });
    }
    done++;
    onProgress?.({ done, total });
  }

  // -----------------------------------------------------------
  // Second pass: apply linked-unit relations. Runs after all
  // products are inserted/updated so wrappers can resolve their
  // base by code (whether created in this file or pre-existing).
  // Retry-safe: server RPC upserts by wrapper_id.
  // -----------------------------------------------------------
  try {
    const wantsLink = valid.filter((v) => v.row.base_code && v.row.base_ratio != null);
    if (wantsLink.length) {
      const codesNeeded = new Set<string>();
      for (const v of wantsLink) {
        if (v.row.code) codesNeeded.add(v.row.code);
        codesNeeded.add(v.row.base_code);
      }
      const { data: byCode } = await supabase
        .from("products")
        .select("id, code")
        .in("code", Array.from(codesNeeded));
      const codeToId = new Map<string, string>();
      for (const p of byCode ?? []) if ((p as any).code) codeToId.set(String((p as any).code).toLowerCase(), (p as any).id);
      // resolve wrapper id: prefer per-row productId captured in perRow, fallback by code
      const rowResultByRow = new Map<number, string | undefined>();
      for (const pr of result.perRow) rowResultByRow.set(pr.row, pr.productId);

      for (const v of wantsLink) {
        const rr = v.row;
        const wrapperId = rowResultByRow.get(rr._row) ?? (rr.code ? codeToId.get(rr.code.toLowerCase()) : undefined);
        const baseId = codeToId.get(rr.base_code.toLowerCase());
        if (!wrapperId || !baseId) continue;
        const ratio = coerceRatio(rr.base_ratio);
        if (ratio == null) continue;
        try {
          const { error } = await supabase.rpc("set_product_unit_link", {
            _wrapper_id: wrapperId,
            _base_id: baseId,
            _ratio: ratio,
          });
          if (error) throw error;
        } catch (e: any) {
          // annotate the per-row record with the failure so the user sees it in the report
          const found = result.perRow.find((p) => p.row === rr._row);
          const msg = e?.message || "ผูกสินค้าสัมพันธ์ไม่สำเร็จ";
          if (found) found.message = (found.message ? found.message + " | " : "") + msg;
          else result.perRow.push({ row: rr._row, status: "failed", message: msg });
        }
      }
    }
  } catch (_e) {
    // Non-fatal: product rows already committed; link-only failures are annotated per-row above.
  }

  return result;
}

export function buildErrorReportCSV(report: PosImportReport): string {
  const header = ["row", "code", "name", "status", "errors", "warnings"];
  const lines = [header.join(",")];
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  for (const r of report.rows) {
    if (r.status === "ok") continue;
    lines.push([
      r.row._row, esc(r.row.code), esc(r.row.name), r.status,
      esc(r.errors.join(" | ")), esc(r.warnings.join(" | ")),
    ].join(","));
  }
  return "\uFEFF" + lines.join("\n") + "\n";
}
