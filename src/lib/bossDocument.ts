/**
 * "บอส" — ตัวคำนวณและตัวตรวจสอบผลลัพธ์ AI ฝั่งแอป
 *
 * กติกา: ตัวเลขจาก AI ไม่ใช่ source of truth — ทุกยอดจะถูกคำนวณใหม่ที่นี่เสมอ
 * และถ้าเลขของ AI ไม่ตรงกับผลคำนวณ จะถูก override พร้อมบันทึกคำเตือน
 */
export type BossDocumentType = "quotation" | "delivery" | "receipt";
export type BossVatMode = "none" | "exclusive" | "inclusive";

export interface BossItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  needsReview?: boolean;
}

export interface BossCustomer {
  name: string;
  organization: string;
  taxId: string;
  address: string;
  phone: string;
}

export interface BossResult {
  documentType: BossDocumentType;
  shop: string | null;
  vatMode: BossVatMode;
  vatRate: number;
  customer: BossCustomer;
  items: BossItem[];
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  notes: string;
  warnings: string[];
  arithmeticVerified: boolean;
}

/** ปัดทศนิยม 2 ตำแหน่งแบบเลี่ยง floating-point error (คิดเป็นสตางค์) */
export function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** จำนวนเงินของหนึ่งรายการ = จำนวน × ราคาต่อหน่วย */
export function lineAmount(item: Pick<BossItem, "quantity" | "unitPrice">): number {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.unitPrice) || 0;
  return round2(qty * price);
}

export interface BossTotals {
  subtotal: number;
  /** ฐานที่ใช้คิด VAT (inclusive = ยอดหลังถอด VAT) */
  vatBase: number;
  vatAmount: number;
  grandTotal: number;
}

export function computeTotals(items: BossItem[], vatMode: BossVatMode, vatRate: number): BossTotals {
  const rate = vatMode === "none" ? 0 : Math.max(0, Number(vatRate) || 0);
  const subtotal = round2(items.reduce((s, it) => s + lineAmount(it), 0));

  if (vatMode === "exclusive") {
    const vatAmount = round2((subtotal * rate) / 100);
    return { subtotal, vatBase: subtotal, vatAmount, grandTotal: round2(subtotal + vatAmount) };
  }
  if (vatMode === "inclusive") {
    // ยอดรายการที่กรอกถือว่ารวม VAT แล้ว → grand = ผลรวมรายการ, ถอด VAT ออกเพื่อหา subtotal
    const grandTotal = subtotal;
    const vatAmount = round2((grandTotal * rate) / (100 + rate));
    const preVat = round2(grandTotal - vatAmount);
    return { subtotal: preVat, vatBase: preVat, vatAmount, grandTotal };
  }
  return { subtotal, vatBase: subtotal, vatAmount: 0, grandTotal: subtotal };
}

export interface BossVerification {
  ok: boolean;
  /** ผลรวมรายการตรงกับ subtotal ที่ AI ให้มาหรือไม่ */
  subtotalMatches: boolean;
  vatMatches: boolean;
  grandTotalMatches: boolean;
  vatBaseLabel: string;
  totals: BossTotals;
  issues: string[];
}

const EPS = 0.011;
const near = (a: number, b: number) => Math.abs(round2(a) - round2(b)) <= EPS;

/** เทียบเลขที่ AI ให้มากับผลคำนวณของแอป */
export function verifyResult(result: BossResult): BossVerification {
  const totals = computeTotals(result.items, result.vatMode, result.vatRate);
  const subtotalMatches = near(totals.subtotal, result.subtotal);
  const vatMatches = near(totals.vatAmount, result.vatAmount);
  const grandTotalMatches = near(totals.grandTotal, result.grandTotal);
  const issues: string[] = [];
  if (!subtotalMatches) issues.push(`ผลรวมรายการ ${totals.subtotal.toFixed(2)} ไม่ตรงกับยอดที่อ่านได้ ${round2(result.subtotal).toFixed(2)}`);
  if (!vatMatches) issues.push(`VAT ที่คำนวณได้ ${totals.vatAmount.toFixed(2)} ไม่ตรงกับที่อ่านได้ ${round2(result.vatAmount).toFixed(2)}`);
  if (!grandTotalMatches) issues.push(`ยอดสุทธิที่คำนวณได้ ${totals.grandTotal.toFixed(2)} ไม่ตรงกับที่อ่านได้ ${round2(result.grandTotal).toFixed(2)}`);
  const vatBaseLabel =
    result.vatMode === "none"
      ? "ไม่คิด VAT"
      : result.vatMode === "exclusive"
        ? `คิด ${result.vatRate}% จากยอดรวมรายการ ${totals.vatBase.toFixed(2)}`
        : `ถอด ${result.vatRate}% ออกจากยอดรวม (ฐานก่อน VAT ${totals.vatBase.toFixed(2)})`;
  return {
    ok: subtotalMatches && vatMatches && grandTotalMatches,
    subtotalMatches,
    vatMatches,
    grandTotalMatches,
    vatBaseLabel,
    totals,
    issues,
  };
}

/** บังคับให้ผลลัพธ์ใช้ตัวเลขของแอปเสมอ (AI override) */
export function normalizeResult(result: BossResult): BossResult {
  const items = result.items.map((it) => {
    const amount = lineAmount(it);
    const needsReview = !!it.needsReview || !near(amount, Number(it.amount) || 0) || !(Number(it.unitPrice) > 0);
    return { ...it, quantity: Number(it.quantity) || 0, unitPrice: round2(it.unitPrice), amount, needsReview };
  });
  // เก็บคำเตือนจากการเทียบกับเลขที่ AI ให้มา แล้ว "override" ด้วยเลขของแอปเสมอ
  const v = verifyResult({ ...result, items });
  return {
    ...result,
    items,
    subtotal: v.totals.subtotal,
    vatAmount: v.totals.vatAmount,
    grandTotal: v.totals.grandTotal,
    warnings: [...(result.warnings ?? []), ...v.issues],
    // ตัวเลขชุดใหม่มาจากตัวคำนวณของแอป จึงถือว่าตรวจแล้วเสมอ
    arithmeticVerified: true,
  };
}

export function emptyResult(overrides: Partial<BossResult> = {}): BossResult {
  return {
    documentType: "quotation",
    shop: null,
    vatMode: "exclusive",
    vatRate: 7,
    customer: { name: "", organization: "", taxId: "", address: "", phone: "" },
    items: [],
    subtotal: 0,
    vatAmount: 0,
    grandTotal: 0,
    notes: "",
    warnings: [],
    arithmeticVerified: true,
    ...overrides,
  };
}

/** สรุปแบบข้อความสำหรับปุ่ม "คัดลอกข้อมูล" */
export function toCopyText(r: BossResult, shopName: string, docLabel: string): string {
  const lines = [
    `${docLabel} — ${shopName}`,
    r.customer.name ? `ลูกค้า: ${r.customer.name}` : "",
    r.customer.organization ? `หน่วยงาน: ${r.customer.organization}` : "",
    r.customer.taxId ? `เลขผู้เสียภาษี: ${r.customer.taxId}` : "",
    r.customer.phone ? `โทร: ${r.customer.phone}` : "",
    r.customer.address ? `ที่อยู่: ${r.customer.address}` : "",
    "",
    "ลำดับ | รายการ | จำนวน | หน่วย | ราคา/หน่วย | จำนวนเงิน",
    ...r.items.map((it, i) =>
      `${i + 1} | ${it.description} | ${it.quantity} | ${it.unit || "-"} | ${round2(it.unitPrice).toFixed(2)} | ${lineAmount(it).toFixed(2)}`,
    ),
    "",
    `รวมเป็นเงิน: ${r.subtotal.toFixed(2)}`,
    `VAT: ${r.vatAmount.toFixed(2)}`,
    `ยอดสุทธิ: ${r.grandTotal.toFixed(2)}`,
    r.notes ? `หมายเหตุ: ${r.notes}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
