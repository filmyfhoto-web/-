/**
 * กฎเหล็กระดับระบบ — "ทุกงานต้องเริ่มจากใบเสนอราคา" (Quotation First)
 *
 * ใช้ร่วมกันทุกช่องทาง: บอท LINE / ไฟล์แนบของบอท / AI ผู้ช่วยในหน้าออกเอกสาร
 * ฟังก์ชันทั้งหมดเป็น pure function เพื่อให้ทดสอบได้จริง
 */
import { computeDocBotMissing, type DocBotCommand, type DocBotDocType } from "./docBotCommands.ts";

/** เอกสารขั้นถัดไป — ออกได้เฉพาะเมื่ออ้างอิงใบเสนอราคาที่ออกเลขแล้ว */
export const NEXT_DOC_TYPES: DocBotDocType[] = ["delivery_note", "receipt", "tax_receipt"];

export const NEXT_DOC_LABELS: Record<string, string> = {
  delivery_note: "ใบส่งของ",
  delivery: "ใบส่งของ",
  receipt: "ใบเสร็จรับเงิน",
  tax_receipt: "ใบกำกับภาษี",
  tax_invoice: "ใบกำกับภาษี",
  quotation: "ใบเสนอราคา",
  job_order: "ใบสั่งงาน",
};

/** ชนิดเอกสารใน rds_documents ที่ตรงกับชนิดของบอท */
export const RDS_TYPE_BY_BOT_TYPE: Record<string, "delivery" | "receipt" | "tax_invoice"> = {
  delivery_note: "delivery",
  delivery: "delivery",
  receipt: "receipt",
  tax_receipt: "tax_invoice",
  tax_invoice: "tax_invoice",
};

export function isNextDocType(docType: string): boolean {
  return NEXT_DOC_TYPES.includes(docType as DocBotDocType);
}

/**
 * อ่านการอ้างอิงใบเสนอราคาต้นทางจากข้อความ
 *   "สร้างใบส่งของจาก QT-2026-0001" · "ออกใบเสร็จจากใบเสนอราคา QT-2026-0001"
 *   "อ้างอิงใบเสนอราคา QT2026-0001"
 */
export function parseSourceQuotationRef(text: string): string | null {
  const t = String(text || "");
  const m =
    t.match(/(?:จาก|อ้างอิง|ตาม|ref|from)\s*(?:ใบเสนอราคา|ใบเสนอ|quotation|qt)?\s*[:：#]?\s*((?:QT|Q)[A-Za-z0-9\-_/]*\d[A-Za-z0-9\-_/]*)/i) ??
    t.match(/(?:ใบเสนอราคา|quotation)\s*(?:เลขที่)?\s*[:：#]?\s*((?:QT|Q)[A-Za-z0-9\-_/]*\d[A-Za-z0-9\-_/]*)/i);
  const no = m?.[1]?.trim();
  if (!no) return null;
  return no.replace(/[.,;]+$/, "").toUpperCase();
}

export interface QuotationFirstOutcome {
  command: DocBotCommand;
  /** ถูกเปลี่ยนเป็นใบเสนอราคาเพราะเป็นงานใหม่ */
  coerced: boolean;
  /** ชนิดเอกสารที่ผู้ใช้ขอมาตอนแรก */
  requestedType: DocBotDocType | null;
  /** เอกสารพร้อมกันที่ถูกตัดออก */
  droppedCompanions: DocBotDocType[];
  notices: string[];
}

/**
 * บังคับกฎกับคำสั่งของบอท:
 *  - งานใหม่ (ไม่มีใบเสนอราคาต้นทาง) → ออกได้เฉพาะใบเสนอราคา และตัด "พร้อม: ..." ที่เป็นเอกสารขั้นถัดไปทิ้ง
 *  - ถ้ามีใบเสนอราคาต้นทางแล้ว → ปล่อยผ่านตามเดิม
 */
export function enforceQuotationFirst(
  command: DocBotCommand,
  sourceQuotationNo: string | null = null,
): QuotationFirstOutcome {
  if (sourceQuotationNo) {
    return { command, coerced: false, requestedType: null, droppedCompanions: [], notices: [] };
  }

  const notices: string[] = [];
  const requestedType = isNextDocType(command.docType) ? command.docType : null;
  const droppedCompanions = (command.doc?.companions ?? []).filter((c) => isNextDocType(c));
  const keptCompanions = (command.doc?.companions ?? []).filter((c) => !isNextDocType(c));

  if (!requestedType && !droppedCompanions.length) {
    return { command, coerced: false, requestedType: null, droppedCompanions: [], notices: [] };
  }

  const docType: DocBotDocType = requestedType ? "quotation" : command.docType;
  const fields = { ...command.fields };
  const next: DocBotCommand = {
    ...command,
    docType,
    fields,
    doc: { ...command.doc, companions: keptCompanions },
    missing: computeDocBotMissing(docType, fields),
  };

  if (requestedType) {
    notices.push(
      `ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน — คำสั่งออก${NEXT_DOC_LABELS[requestedType]}จึงถูกเปลี่ยนเป็น “ใบเสนอราคา (ฉบับร่าง)”`,
    );
  }
  if (droppedCompanions.length) {
    notices.push(
      `ยังออก${droppedCompanions.map((c) => NEXT_DOC_LABELS[c]).join(" / ")}พร้อมกันไม่ได้ค่ะ — ออกได้หลังใบเสนอราคาออกเลขแล้ว โดยพิมพ์ “สร้างใบส่งของจาก QT-xxxx”`,
    );
  }
  return { command: next, coerced: Boolean(requestedType), requestedType, droppedCompanions, notices };
}

/** เหตุผลที่ปฏิเสธการสร้างเอกสารขั้นถัดไป (ตรงกับ error ของฐานข้อมูล) */
export type QuotationSourceReason =
  | "quotation_required"
  | "source_not_found"
  | "source_not_quotation"
  | "source_not_issued"
  | "source_store_mismatch";

export function quotationSourceReasonOf(message: string): QuotationSourceReason | null {
  const m = String(message || "");
  const reasons: QuotationSourceReason[] = [
    "quotation_required",
    "source_not_found",
    "source_not_quotation",
    "source_not_issued",
    "source_store_mismatch",
  ];
  return reasons.find((r) => m.includes(r)) ?? null;
}

export function buildQuotationBlockText(reason: QuotationSourceReason, docNo?: string | null): string {
  const ref = docNo ? ` (${docNo})` : "";
  switch (reason) {
    case "source_not_found":
      return `❌ ไม่พบใบเสนอราคาต้นทาง${ref} ค่ะ — ตรวจเลขที่อีกครั้ง แล้วพิมพ์ “สร้างใบส่งของจาก QT-xxxx”`;
    case "source_not_quotation":
      return `❌ เอกสารต้นทาง${ref} ไม่ใช่ใบเสนอราคา — เอกสารขั้นถัดไปต้องอ้างอิงใบเสนอราคาเท่านั้นค่ะ`;
    case "source_not_issued":
      return `❌ ใบเสนอราคา${ref} ยังเป็นฉบับร่าง/ถูกยกเลิก — ออกเลขใบเสนอราคาก่อน แล้วค่อยสร้างเอกสารถัดไปค่ะ`;
    case "source_store_mismatch":
      return `❌ ใบเสนอราคา${ref} เป็นของอีกร้านหนึ่ง — ต้องอยู่ร้านเดียวกันเท่านั้นค่ะ`;
    default:
      return "❌ ยังสร้างเอกสารนี้ไม่ได้ค่ะ — ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน แล้วพิมพ์ “สร้างใบส่งของจาก QT-xxxx”";
  }
}
