/**
 * Deterministic detector for numbered LINE purchase lists.
 * Kept dependency-free so the webhook and browser review UI can share the
 * same conservative interpretation without an AI call or database access.
 */

const UNITS = [
  "ชิ้น", "อัน", "แพ็ค", "แพ็ก", "กล่อง", "ห่อ", "รีม", "ม้วน", "เล่ม", "ชุด", "โหล", "ด้าม", "ตัว",
  "แผ่น", "ซอง", "ถุง", "ขวด", "กระป๋อง", "คู่", "งาน", "ตร.ม.", "เมตร", "กิโลกรัม", "กก.", "แท่ง",
];
const BULLET_RE = /^\s*(\d{1,2})\s*[.)]\s*[).]?\s*(.*)$/;
const UNIT_RE = new RegExp(`(${UNITS.map((u) => u.replace(/\./g, "\\.")).join("|")})`);
const NEGATIVE_WORDS = ["โครงการ", "งบประมาณ", "เจ้าภาพ", "บุตร", "ธิดา", "ผู้ปกครอง", "รายชื่อ"];
const NEGATIVE_PREFIX = /^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|พ่อ|แม่|คุณ)\s*\S/;
const POSITIVE_WORDS = ["รายการสินค้า", "รายการ", "สั่งของ", "สั่งซื้อ", "ขอสินค้า", "รบกวนสั่ง", "เอาของ", "ขอของ"];

export interface ChatOrderLine {
  name: string;
  qty: number;
  unit: string;
  hasQty: boolean;
  raw: string;
}

export interface ChatOrderDetection {
  looksLikeOrder: boolean;
  confidence: number;
  lines: ChatOrderLine[];
  reasons: string[];
}

function tidy(value: string): string {
  return value.replace(/[*•✅✔️🔹👉📌➡️]+/gu, " ").replace(/\s{2,}/g, " ").trim();
}

function cleanNumber(value: string): number | null {
  const n = Number(String(value).replace(/[,.\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseChatLine(rawLine: string): ChatOrderLine | null {
  const raw = tidy(rawLine);
  if (!raw) return null;
  const body = raw.replace(/\s*[=:]\s*/g, " ").replace(/\s*[x×]\s*(?=\d)/gi, " ");
  const withUnit = body.match(new RegExp(`^(.*?)(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RE.source}\\.?\\s*$`));
  if (withUnit) {
    const name = tidy(withUnit[1]);
    const qty = cleanNumber(withUnit[2]) ?? 0;
    if (name && qty > 0 && qty <= 100000) return { name, qty, unit: withUnit[3], hasQty: true, raw };
  }
  const trailingNum = body.match(/^(.*?)(\d+(?:[.,]\d+)?)\s*$/);
  if (trailingNum) {
    const name = tidy(trailingNum[1]);
    const qty = cleanNumber(trailingNum[2]) ?? 0;
    if (name && qty > 0 && qty <= 999) return { name, qty, unit: "", hasQty: true, raw };
  }
  return { name: raw, qty: 1, unit: "", hasQty: false, raw };
}

export function detectChatOrder(text: string): ChatOrderDetection {
  const empty: ChatOrderDetection = { looksLikeOrder: false, confidence: 0, lines: [], reasons: [] };
  const source = String(text ?? "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return empty;
  const allLines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const numbered = allLines
    .map((line) => line.match(BULLET_RE)?.[2]?.trim() ?? "")
    .filter(Boolean);
  if (numbered.length < 2) return { ...empty, reasons: ["มีบรรทัดเลขข้อไม่ถึง 2 บรรทัด"] };

  const lines = numbered.map(parseChatLine).filter(Boolean) as ChatOrderLine[];
  const withQty = lines.filter((line) => line.hasQty).length;
  const withUnit = lines.filter((line) => Boolean(line.unit)).length;
  const qtyRatio = lines.length ? withQty / lines.length : 0;
  const reasons = [`บรรทัดเลขข้อ ${lines.length} บรรทัด`, `มีจำนวน ${withQty} บรรทัด`];
  let score = 0.25 + Math.min(lines.length, 8) * 0.03 + qtyRatio * 0.45;
  if (withUnit > 0) { score += 0.15; reasons.push(`มีหน่วยนับ ${withUnit} บรรทัด`); }
  if (POSITIVE_WORDS.some((word) => allLines.slice(0, 3).join(" ").includes(word))) {
    score += 0.12;
    reasons.push("มีคำนำว่าเป็นรายการ");
  }
  const negativeLines = lines.filter(
    (line) => NEGATIVE_PREFIX.test(line.raw) || NEGATIVE_WORDS.some((word) => line.raw.includes(word)),
  ).length;
  if (negativeLines) {
    score -= (negativeLines / lines.length) * 0.6;
    reasons.push(`บรรทัดที่ดูไม่ใช่รายการของ ${negativeLines} บรรทัด`);
  }
  const confidence = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  return { looksLikeOrder: qtyRatio >= 0.4 && confidence >= 0.6, confidence, lines, reasons };
}
