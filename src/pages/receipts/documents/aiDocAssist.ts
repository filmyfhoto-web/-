/**
 * AI ผู้ช่วยออกเอกสาร — ตัวแปลงผลจาก AI ให้ลงฟอร์ม "ออกเอกสาร" เดิม
 *
 * กติกาเหล็ก 3 ข้อ (บังคับที่ชั้นนี้ ไม่ใช่แค่ prompt ของ AI):
 *  1) งานใหม่ต้องเริ่มจาก "ใบเสนอราคา" เสมอ — ไม่ว่า AI/ผู้ใช้จะสั่งอะไรมา
 *  2) ห้าม AI แต่งข้อมูล — ค่าที่ไม่พบให้ว่างไว้ แล้วรายงานใน "ช่องที่ยังไม่พบ"
 *  3) ภาษี/เทมเพลตต้องมาจากร้านที่กำลังเปิดอยู่เท่านั้น ห้ามข้ามร้าน
 */
import type { RdsStore } from "../types";
import type { BossResult } from "@/lib/bossDocument";
import { round2 } from "@/lib/bossDocument";
import { defaultsForStore, type DocFormState, type DocItem } from "./useDocumentForm";

export const AI_SUPPORTED_HINT = "PDF, รูปภาพ (JPG/PNG/WebP), Word (.docx), Excel (XLSX/XLS), CSV, TXT";

const SHEET_EXT = /\.(xlsx|xls|csv)$/i;
const TEXT_EXT = /\.(txt|md|csv)$/i;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word รุ่นเก่า (.doc) — อ่านไม่ได้อย่างแม่นยำ ต้องให้ผู้ใช้แปลงไฟล์ก่อน */
export function isLegacyDocFile(file: { name: string; type?: string }): boolean {
  const mime = String(file.type ?? "").toLowerCase().split(";")[0];
  const name = String(file.name ?? "");
  if (/\.docx$/i.test(name) || mime === DOCX_MIME) return false;
  return /\.doc$/i.test(name) || mime === "application/msword";
}

/** ไฟล์ที่ระบบอ่านได้จริง (ไม่รองรับ = แจ้งชัดเจน ห้ามเดา) */
export function isAiReadableFile(file: { name: string; type?: string }): boolean {
  const mime = String(file.type ?? "").toLowerCase().split(";")[0];
  const name = String(file.name ?? "");
  if (isLegacyDocFile(file)) return false;
  if (mime === DOCX_MIME || /\.docx$/i.test(name)) return true;
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return true;
  if (SHEET_EXT.test(name)) return true;
  if (TEXT_EXT.test(name)) return true;
  if (mime.startsWith("text/")) return true;
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel") return true;
  return false;
}

export function unsupportedFileMessage(file: { name: string }): string {
  if (isLegacyDocFile(file as { name: string; type?: string })) {
    return `ไฟล์ "${file.name}" เป็น Word รุ่นเก่า (.doc) ระบบอ่านไม่ได้อย่างแม่นยำ — กรุณาบันทึกเป็น .docx หรือ PDF แล้วแนบใหม่`;
  }
  return `ไฟล์ "${file.name}" ระบบยังอ่านไม่ได้ (รองรับ ${AI_SUPPORTED_HINT}) — กรุณาแปลงเป็น PDF หรือถ่ายรูปหน้าเอกสารแทน`;
}

/** บังคับให้ผลลัพธ์เป็นใบเสนอราคาเสมอ */
export function coerceToQuotation(result: BossResult): {
  result: BossResult;
  coerced: boolean;
  requestedLabel: string | null;
} {
  const requested = result.documentType;
  if (requested === "quotation") return { result, coerced: false, requestedLabel: null };
  const label = requested === "delivery" ? "ใบส่งของ" : requested === "receipt" ? "ใบเสร็จรับเงิน" : "เอกสารอื่น";
  return { result: { ...result, documentType: "quotation" }, coerced: true, requestedLabel: label };
}

export interface AiDocMapping {
  patch: Partial<DocFormState>;
  items: Partial<DocItem>[];
  /** ป้ายชื่อช่องที่ AI ไม่พบข้อมูล — ผู้ใช้ต้องกรอกเอง */
  missing: string[];
  /** ข้อความแจ้งผู้ใช้ เช่น การบังคับเป็นใบเสนอราคา, การใช้ค่า VAT ของร้าน */
  notices: string[];
  /** จำนวนรายการที่ AI ไม่มั่นใจ (ต้องตรวจสอบ) */
  needsReviewCount: number;
}

const clean = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return !s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined" ? "" : s;
};

/** แปลงผล AI → ค่าที่จะ patch ลงฟอร์มของ "ร้านที่กำลังเปิดอยู่" */
export function mapAiResultToForm(
  raw: BossResult,
  store: RdsStore | null,
  current: Pick<DocFormState, "paper_size" | "template" | "document_date">,
): AiDocMapping {
  const { result, coerced, requestedLabel } = coerceToQuotation(raw);
  const notices: string[] = [];
  if (coerced) {
    notices.push(
      `ระบบกำหนดให้เริ่มจากใบเสนอราคาก่อน — คำสั่ง "${requestedLabel}" จึงถูกเปลี่ยนเป็นใบเสนอราคา (ฉบับร่าง) ออกเอกสารถัดไปได้จากใบเสนอราคานี้`,
    );
  }

  // ภาษี/เทมเพลต = ของร้านปัจจุบันเท่านั้น (ห้ามใช้ค่าจากไฟล์/ร้านอื่น)
  const storeDefaults = defaultsForStore(store);
  if (store && result.vatMode && result.vatMode !== (storeDefaults.vat_mode ?? "none")) {
    notices.push(`ใช้การตั้งค่า VAT ของร้าน "${store.name}" แทนค่าที่อ่านได้จากไฟล์`);
  }

  const org = clean(result.customer?.organization);
  const person = clean(result.customer?.name);
  const customerName = org || person;
  const phone = clean(result.customer?.phone);
  const address = clean(result.customer?.address);
  const taxDigits = clean(result.customer?.taxId).replace(/[^\d]/g, "");
  const taxId = taxDigits.length === 13 ? taxDigits : "";
  const project = clean((result as unknown as { project?: string }).project);
  const notes = clean(result.notes);

  const items: Partial<DocItem>[] = (result.items ?? [])
    .map((it) => ({
      name: clean(it.description),
      quantity: Number(it.quantity) || 0,
      unit: clean(it.unit),
      price: round2(Number(it.unitPrice) || 0),
      description: "",
      discount_percent: 0,
      discount_amount: 0,
    }))
    .filter((it) => it.name);

  const missing: string[] = [];
  if (!customerName) missing.push("ชื่อลูกค้า/หน่วยงาน");
  if (!phone) missing.push("เบอร์โทร");
  if (!address) missing.push("ที่อยู่");
  if (!taxId) missing.push("เลขประจำตัวผู้เสียภาษี");
  if (!project) missing.push("ชื่อโครงการ");
  if (!items.length) missing.push("รายการสินค้า/บริการ");
  items.forEach((it, i) => {
    if (!(Number(it.quantity) > 0)) missing.push(`จำนวนของรายการที่ ${i + 1}`);
    if (!(Number(it.price) > 0)) missing.push(`ราคาต่อหน่วยของรายการที่ ${i + 1}`);
  });

  const patch: Partial<DocFormState> = {
    // กฎเหล็ก: เอกสารแรกเป็นใบเสนอราคาฉบับร่างเสมอ
    document_type: "quotation",
    status_workflow: "draft",
    companion_set: "none",
    // ใช้ค่าปัจจุบันของร้าน/ฟอร์มเดิมถ้าไฟล์ไม่ได้ระบุ
    paper_size: current.paper_size,
    template: current.template,
    document_date: current.document_date,
    ...storeDefaults,
  };
  if (customerName) patch.customer_name = customerName;
  if (phone) patch.customer_phone = phone;
  if (address) patch.customer_address = address;
  if (taxId) patch.customer_tax_id = taxId;
  if (project) patch.project_name = project;
  if (notes) patch.notes = notes;
  // ลูกค้าที่ AI กรอกยังไม่ผูกกับฐานข้อมูล — ล้าง customer_id กัน mismatch
  patch.customer_id = null;

  return {
    patch,
    items,
    missing,
    notices: [...notices, ...(result.warnings ?? []).filter(Boolean)],
    needsReviewCount: (result.items ?? []).filter((it) => it.needsReview).length,
  };
}
