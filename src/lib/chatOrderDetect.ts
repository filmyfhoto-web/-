/**
 * ตรวจจับ "ข้อความแชท LINE ที่น่าจะเป็นรายการสั่งของ"
 *
 * ต่างจาก `parseSmartImport` (อ่านตาราง/ไฟล์ที่มีตัวคั่น) — ตัวนี้อ่านข้อความที่ลูกค้า
 * พิมพ์มาในแชทแบบบรรทัดต่อบรรทัด เช่น
 *   1. กระดาษเคลือบหลังเหลือง a4 2 แพ็ค
 *   2. ฟิวเจอร์บอร์ดขนาดกลาง 20 แผ่น
 *
 * ใช้คำหน่วยนับชุดเดียวกับตัวอ่านไฟล์ (UNIT_WORDS) และไม่แตะฐานข้อมูลใด ๆ
 * หลักการให้คะแนน: "พลาดบ้างดีกว่าแจ้งเตือนผิดบ่อย"
 */
import { UNIT_WORDS, cleanNumber } from "@/lib/smartImport";
import { newItemId, type WorkLineItem } from "@/lib/workDesk";

/** หัวข้อแบบ 1. / 2) / 3.) / ๑. */
const BULLET_RE = /^\s*(\d{1,2})\s*[.)]\s*[).]?\s*(.*)$/;

/** คำที่บอกว่าน่าจะ "ไม่ใช่" รายการสินค้า (พบจริงในแชทของร้าน) */
const NEGATIVE_WORDS = ["โครงการ", "งบประมาณ", "เจ้าภาพ", "บุตร", "ธิดา", "ผู้ปกครอง", "รายชื่อ"];
const NEGATIVE_PREFIX = /^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|พ่อ|แม่|คุณ)\s*\S/;

/** คำนำที่บอกว่าน่าจะ "ใช่" รายการสินค้า */
const POSITIVE_WORDS = ["รายการสินค้า", "รายการ", "สั่งของ", "สั่งซื้อ", "ขอสินค้า", "รบกวนสั่ง", "เอาของ", "ขอของ"];

export interface ChatOrderLine {
  /** ชื่อสินค้าที่อ่านได้ */
  name: string;
  qty: number;
  unit: string;
  /** มีจำนวนระบุมาจริงในข้อความ (ไม่ได้เดาเป็น 1) */
  hasQty: boolean;
  raw: string;
}

export interface ChatOrderDetection {
  /** ผ่านเกณฑ์พอจะขึ้นการ์ดแจ้งเตือนหรือไม่ */
  looksLikeOrder: boolean;
  /** 0–1 (ยิ่งสูงยิ่งมั่นใจ) */
  confidence: number;
  lines: ChatOrderLine[];
  /** เหตุผลย่อ ๆ ใช้ดีบักและเขียนเทสต์ */
  reasons: string[];
}

const UNIT_RE = new RegExp(`(${UNIT_WORDS.map((u) => u.replace(/\./g, "\\.")).join("|")})`);

/** ตัดอักขระตกแต่งท้ายบรรทัด (* • ✅ ฯลฯ) และช่องว่างซ้ำ */
function tidy(s: string): string {
  return s
    .replace(/[*•✅✔️🔹👉📌➡️]+/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * ดึงจำนวน + หน่วย จากท้ายบรรทัด เช่น
 *   "กระดาษ a4 2 แพ็ค" → qty 2 หน่วย แพ็ค
 *   "กาวสองหน้าบาง 4 อัน" → qty 4 หน่วย อัน
 *   "หมึกเครื่องปริ้น = 2 ชุด" → qty 2 หน่วย ชุด
 *   "ลูกบอลสี" → ไม่มีจำนวน
 */
export function parseChatLine(rawLine: string): ChatOrderLine | null {
  const raw = tidy(rawLine);
  if (!raw) return null;

  // "= 2 ชุด" / "x 2" ให้ตัดเครื่องหมายทิ้งก่อน
  const body = raw.replace(/\s*[=:]\s*/g, " ").replace(/\s*[x×]\s*(?=\d)/gi, " ");

  // จำนวน + หน่วย ที่อยู่ท้ายบรรทัด (ยอมให้มีคำต่อท้ายสั้น ๆ)
  const withUnit = body.match(new RegExp(`^(.*?)(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE.source}\\.?\\s*$`));
  if (withUnit) {
    const name = tidy(withUnit[1]);
    const qty = cleanNumber(withUnit[2]) ?? 0;
    if (name && qty > 0) return { name, qty, unit: withUnit[3], hasQty: true, raw };
  }

  // หน่วยมาก่อนจำนวน เช่น "กระดาษ a4 ลัง" (ไม่มีตัวเลข) → ถือว่าไม่มีจำนวน
  const trailingNum = body.match(/^(.*?)(\d+(?:[.,]\d+)?)\s*$/);
  if (trailingNum) {
    const name = tidy(trailingNum[1]);
    const qty = cleanNumber(trailingNum[2]) ?? 0;
    // ตัวเลขท้ายบรรทัดที่ดูเป็นราคา/งบ (มากกว่า 999) ไม่นับเป็นจำนวน
    if (name && qty > 0 && qty <= 999) return { name, qty, unit: "", hasQty: true, raw };
  }

  return { name: raw, qty: 1, unit: "", hasQty: false, raw };
}

/** ตรวจข้อความหนึ่งก้อนว่าเข้าข่าย "รายการสั่งของ" ไหม */
export function detectChatOrder(text: string): ChatOrderDetection {
  const empty: ChatOrderDetection = { looksLikeOrder: false, confidence: 0, lines: [], reasons: [] };
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  if (!src.trim()) return empty;

  const allLines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletLines: string[] = [];
  for (const l of allLines) {
    const m = l.match(BULLET_RE);
    if (m && m[2].trim()) bulletLines.push(m[2].trim());
  }
  if (bulletLines.length < 2) {
    return { ...empty, reasons: ["มีบรรทัดเลขข้อไม่ถึง 2 บรรทัด"] };
  }

  const parsed = bulletLines.map(parseChatLine).filter(Boolean) as ChatOrderLine[];
  const withQty = parsed.filter((l) => l.hasQty).length;
  const withUnit = parsed.filter((l) => l.unit).length;
  const qtyRatio = parsed.length ? withQty / parsed.length : 0;

  const reasons: string[] = [`บรรทัดเลขข้อ ${parsed.length} บรรทัด`, `มีจำนวน ${withQty} บรรทัด`];
  let score = 0.25 + Math.min(parsed.length, 8) * 0.03;
  score += qtyRatio * 0.45;
  if (withUnit > 0) { score += 0.15; reasons.push(`มีหน่วยนับ ${withUnit} บรรทัด`); }

  const head = allLines.slice(0, 3).join(" ");
  if (POSITIVE_WORDS.some((w) => head.includes(w))) { score += 0.12; reasons.push("มีคำนำว่าเป็นรายการ"); }

  const negativeLines = parsed.filter(
    (l) => NEGATIVE_PREFIX.test(l.raw) || NEGATIVE_WORDS.some((w) => l.raw.includes(w)),
  ).length;
  if (negativeLines) {
    score -= (negativeLines / parsed.length) * 0.6;
    reasons.push(`บรรทัดที่ดูไม่ใช่รายการของ ${negativeLines} บรรทัด`);
  }

  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  // เกณฑ์ขั้นต่ำ: อย่างน้อย 40% ของบรรทัดต้องมีจำนวน และคะแนนรวมต้องถึง 0.6
  const looksLikeOrder = qtyRatio >= 0.4 && confidence >= 0.6;
  return { looksLikeOrder, confidence, lines: parsed, reasons };
}

/** แปลงผลตรวจจับเป็นรายการของ "รับงานใหม่" (ยังไม่มีราคา — ไปเติมในขั้นยืนยันราคา) */
export function chatLinesToItems(lines: ChatOrderLine[], defaultUnit = "ชิ้น"): WorkLineItem[] {
  return lines.map((l) => ({
    id: newItemId(),
    code: "",
    name: l.name,
    unit: l.unit || defaultUnit,
    price: 0,
    qty: l.qty > 0 ? l.qty : 1,
    source: "import" as const,
    needsReview: !l.hasQty,
    reviewNote: l.hasQty ? undefined : "ไม่พบจำนวนในข้อความ ใช้ค่าเริ่มต้น 1",
  }));
}
