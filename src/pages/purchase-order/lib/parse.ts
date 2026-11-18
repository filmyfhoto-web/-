// Bulk-paste parser for the customer purchase order page. Wraps the existing
// smartParseText engine and exposes a small, PO-focused row shape.

import { smartParseText, type ParsedRow } from "@/pages/receipts/documents/smartParse";

export interface POItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

let _k = 0;
export const newPoKey = () => `po_${Date.now()}_${_k++}`;

const FALLBACK_UNIT = "ชิ้น";

export function rowToItem(r: ParsedRow): POItem {
  return {
    key: newPoKey(),
    name: (r.name ?? "").trim(),
    quantity: r.quantity > 0 ? r.quantity : 1,
    unit: (r.unit && r.unit.trim()) ? r.unit.trim() : FALLBACK_UNIT,
    price: Number.isFinite(r.price) ? r.price : 0,
  };
}

export function parseBulkPaste(text: string): { items: POItem[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!text || !text.trim()) return { items: [], warnings };
  const parsed = smartParseText(text);
  const items = parsed.rows.map(rowToItem);
  if (parsed.errors.length) {
    parsed.errors.slice(0, 5).forEach((e) =>
      warnings.push(`บรรทัด ${e.line}: ${e.reason}`),
    );
  }
  items.forEach((it, idx) => {
    if (!it.price || it.price <= 0) warnings.push(`แถวที่ ${idx + 1} (${it.name}) ไม่มีราคา — โปรดยืนยัน`);
  });
  return { items, warnings };
}

export function lineTotal(it: POItem): number {
  return Math.max(0, (it.quantity || 0) * (it.price || 0));
}

export function poSubtotal(items: POItem[]): number {
  return Math.round(items.reduce((s, it) => s + lineTotal(it), 0) * 100) / 100;
}

/** TSV representation for "คัดลอกเป็นตาราง". */
export function itemsToTsv(items: POItem[]): string {
  const head = ["ลำดับ", "รายการสินค้า", "จำนวน", "หน่วย", "ราคา", "ยอดรวม"].join("\t");
  const body = items
    .filter((it) => it.name.trim())
    .map((it, i) => [
      i + 1,
      it.name,
      it.quantity,
      it.unit,
      it.price.toFixed(2),
      lineTotal(it).toFixed(2),
    ].join("\t"));
  return [head, ...body].join("\n");
}

/** Human-readable summary for share/clipboard fallback. */
export function itemsToSummary(items: POItem[], header: { poNumber: string; customer: string; org: string }): string {
  const lines: string[] = [];
  lines.push(`ใบสั่งสินค้า ${header.poNumber}`);
  if (header.customer) lines.push(`ลูกค้า: ${header.customer}`);
  if (header.org) lines.push(`หน่วยงาน: ${header.org}`);
  lines.push("");
  items
    .filter((it) => it.name.trim())
    .forEach((it, i) => {
      lines.push(`${i + 1}. ${it.name} × ${it.quantity} ${it.unit} @ ${it.price.toFixed(2)} = ${lineTotal(it).toFixed(2)}`);
    });
  lines.push("");
  lines.push(`ยอดรวมประมาณการ: ${poSubtotal(items).toFixed(2)} บาท`);
  lines.push("* ใบสั่งสินค้าเป็นการประเมินราคา ไม่ใช่ใบส่งของ และไม่ใช่ใบเสนอราคา");
  return lines.join("\n");
}