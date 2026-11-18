/**
 * Deterministic Thai parser for LINE job-request messages (Film Shop).
 *
 * Pure TypeScript with no imports so it can be shared by the Deno edge
 * function (supabase/functions/line-webhook) and the browser bundle
 * (src/film-shop/lib/lineJobParser.ts re-exports this file).
 *
 * The parser NEVER guesses: anything it cannot read from the message is
 * reported in `missing` so staff can confirm the request by hand.
 */

export type FilmJobType = "vinyl" | "sticker" | "print" | "design" | "other";

export interface ParsedJobRequest {
  /** false = chit-chat / not an order request */
  isJobRequest: boolean;
  customerName?: string;
  title?: string;
  jobType?: FilmJobType;
  quantity?: number;
  unit?: string;
  sizeText?: string;
  /** undefined = message did not say whether artwork exists */
  hasDesign?: boolean;
  isUrgent: boolean;
  /** ISO-8601 with the +07:00 (Asia/Bangkok) offset */
  dueAtISO?: string;
  notes?: string;
  /** Thai labels of the required fields that are still unknown */
  missing: string[];
}

export const REQUIRED_FIELD_LABELS: Record<string, string> = {
  customerName: "ชื่อลูกค้า",
  title: "หัวข้องาน",
  quantity: "จำนวน",
  dueAt: "วันและเวลานัดรับ",
  hasDesign: "ไฟล์แบบ (มี/ไม่มี)",
};

const JOB_TYPE_KEYWORDS: Array<[FilmJobType, RegExp]> = [
  ["vinyl", /(ไวนิล|vinyl|ป้ายไวนิล|แบนเนอร์|banner)/i],
  ["sticker", /(สติกเกอร์|สติ๊กเกอร์|sticker|ฉลาก)/i],
  ["design", /(ออกแบบ|design|อาร์ตเวิร์ก|artwork)/i],
  ["print", /(พิมพ์|ปริ้น|ปริ้นท์|print|โปสเตอร์|นามบัตร|โบรชัวร์|ใบปลิว)/i],
];

const JOB_KEYWORD = /(สั่ง|ทำป้าย|ทำงาน|จ้าง|ขอใบเสนอราคา|ไวนิล|สติกเกอร์|สติ๊กเกอร์|ป้าย|พิมพ์|ปริ้น|ออกแบบ|โปสเตอร์|นามบัตร|ใบปลิว|แบนเนอร์)/i;
const NOT_JOB = /^(สวัสดี|หวัดดี|ครับ|ค่ะ|ขอบคุณ|ok|okay|โอเค|hello|hi|\?|\.)+$/i;

const UNITS = "(ชิ้น|อัน|ตัว|แผ่น|ผืน|ใบ|ชุด|ม้วน|เมตร|ตร\\.?ม\\.?|กล่อง)";

/** Read `label: value` style lines (Thai + English aliases). */
function labelled(text: string, aliases: string[]): string | undefined {
  for (const a of aliases) {
    const re = new RegExp(`(?:^|\\n)\\s*${a}\\s*[:：=]\\s*(.+)`, "i");
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return undefined;
}

/** Current Y/M/D/H/M in Asia/Bangkok, independent of the host timezone. */
export function bangkokNow(now: Date = new Date()) {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bkk = new Date(utc + 7 * 3600000);
  return {
    year: bkk.getUTCFullYear(),
    month: bkk.getUTCMonth() + 1,
    day: bkk.getUTCDate(),
    hour: bkk.getUTCHours(),
    minute: bkk.getUTCMinutes(),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoBangkok(y: number, m: number, d: number, hh: number, mm: number): string {
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00+07:00`;
}

/** Add whole days to a Y/M/D triple using UTC arithmetic (no TZ drift). */
function addDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function parseTime(text: string): { hh: number; mm: number } | undefined {
  if (/เที่ยงคืน/.test(text)) return { hh: 0, mm: 0 };
  if (/เที่ยง/.test(text)) return { hh: 12, mm: 0 };
  const m = text.match(/(?:เวลา\s*)?(\d{1,2})[:.](\d{2})\s*(น\.?|โมง)?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh <= 23 && mm <= 59) return { hh, mm };
  }
  const m2 = text.match(/(\d{1,2})\s*โมง(?:เย็น|เช้า)?/);
  if (m2) {
    let hh = Number(m2[1]);
    if (/โมงเย็น/.test(m2[0]) && hh < 12) hh += 12;
    if (hh <= 23) return { hh, mm: 0 };
  }
  return undefined;
}

/** Deterministic due-date reader. Returns undefined when nothing explicit. */
export function parseThaiDueAt(text: string, now: Date = new Date()): string | undefined {
  const nb = bangkokNow(now);
  const time = parseTime(text);
  const DEFAULT_HOUR = 17;

  const explicit = text.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/);
  if (explicit) {
    const d = Number(explicit[1]);
    const m = Number(explicit[2]);
    let y = explicit[3] ? Number(explicit[3]) : nb.year;
    if (explicit[3] && String(explicit[3]).length === 2) y = 2000 + y;
    if (y > 2400) y -= 543; // Buddhist Era
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return isoBangkok(y, m, d, time?.hh ?? DEFAULT_HOUR, time?.mm ?? 0);
    }
  }

  let offset: number | undefined;
  if (/มะรืน/.test(text)) offset = 2;
  else if (/พรุ่งนี้/.test(text)) offset = 1;
  else if (/วันนี้/.test(text)) offset = 0;
  else {
    const inDays = text.match(/อีก\s*(\d{1,2})\s*วัน/);
    if (inDays) offset = Number(inDays[1]);
  }
  if (offset !== undefined) {
    const t = addDays(nb.year, nb.month, nb.day, offset);
    return isoBangkok(t.y, t.m, t.d, time?.hh ?? DEFAULT_HOUR, time?.mm ?? 0);
  }

  // Time only → today, or tomorrow when it has already passed.
  if (time) {
    const passed = time.hh < nb.hour || (time.hh === nb.hour && time.mm <= nb.minute);
    const t = addDays(nb.year, nb.month, nb.day, passed ? 1 : 0);
    return isoBangkok(t.y, t.m, t.d, time.hh, time.mm);
  }
  return undefined;
}

export function parseFilmJobMessage(rawText: string, now: Date = new Date()): ParsedJobRequest {
  const text = String(rawText || "").replace(/\r/g, "").trim();
  const flat = text.replace(/\n/g, " ");
  const out: ParsedJobRequest = { isJobRequest: false, isUrgent: false, missing: [] };
  if (!text) {
    out.missing = Object.values(REQUIRED_FIELD_LABELS);
    return out;
  }

  const hasLabels = /(^|\n)\s*(ชื่อ|ลูกค้า|งาน|หัวข้อ|จำนวน|ขนาด|ไฟล์|รับงาน|กำหนด|นัดรับ)\s*[:：=]/i.test(text);
  out.isJobRequest = hasLabels || (JOB_KEYWORD.test(flat) && !NOT_JOB.test(flat));

  // --- customer name
  out.customerName =
    labelled(text, ["ชื่อลูกค้า", "ชื่อ", "ลูกค้า", "name", "customer"]) ||
    (flat.match(/(?:ผม|ดิฉัน|ฉัน|หนู)\s*ชื่อ\s*([^\s,]{2,30})/)?.[1] ?? undefined);

  // --- title / job type
  const titleLabel = labelled(text, ["หัวข้อ", "หัวข้องาน", "งาน", "รายการ", "title", "job"]);
  for (const [type, re] of JOB_TYPE_KEYWORDS) {
    if (re.test(flat)) { out.jobType = type; break; }
  }
  if (!out.jobType && (titleLabel || out.isJobRequest)) out.jobType = "other";
  out.title = titleLabel || (out.jobType && out.jobType !== "other" ? flat.match(JOB_KEYWORD)?.[0] : undefined);

  // --- quantity
  const qLabel = labelled(text, ["จำนวน", "qty", "quantity"]);
  const qSource = qLabel ?? flat;
  const qm = qSource.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNITS}`)) ||
    (qLabel ? qLabel.match(/(\d+(?:\.\d+)?)/) : null);
  if (qm) {
    out.quantity = Number(qm[1]);
    out.unit = (qm[2] as string | undefined) || "ชิ้น";
  }

  // --- size
  const sLabel = labelled(text, ["ขนาด", "size"]);
  const sm = sLabel || flat.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(ซม\.?|ม\.?|cm|m|นิ้ว|เมตร)?/)?.[0];
  if (sm) out.sizeText = String(sm).trim();

  // --- artwork present?
  const fLabel = labelled(text, ["ไฟล์", "ไฟล์แบบ", "แบบ", "artwork", "file"]);
  if (fLabel) {
    if (/(ไม่มี|ยังไม่|no|none|ให้ออกแบบ)/i.test(fLabel)) out.hasDesign = false;
    else if (/(มี|ส่งแล้ว|แนบ|yes|ok)/i.test(fLabel)) out.hasDesign = true;
  } else if (/(ไม่มีไฟล์|ยังไม่มีไฟล์|ยังไม่มีแบบ|ช่วยออกแบบ|ให้ร้านออกแบบ)/.test(flat)) out.hasDesign = false;
  else if (/(มีไฟล์|ส่งไฟล์แล้ว|แนบไฟล์|มีแบบแล้ว)/.test(flat)) out.hasDesign = true;

  // --- urgency
  out.isUrgent = /(ด่วน|เร่ง|urgent|rush|เอาวันนี้)/i.test(flat);

  // --- due date
  const dueLabel = labelled(text, ["รับงาน", "นัดรับ", "กำหนด", "กำหนดรับ", "due", "deadline"]);
  out.dueAtISO = parseThaiDueAt(dueLabel ?? flat, now);

  // --- notes
  out.notes = labelled(text, ["หมายเหตุ", "note", "remark"]);

  const missing: string[] = [];
  if (!out.customerName) missing.push(REQUIRED_FIELD_LABELS.customerName);
  if (!out.title) missing.push(REQUIRED_FIELD_LABELS.title);
  if (out.quantity === undefined) missing.push(REQUIRED_FIELD_LABELS.quantity);
  if (!out.dueAtISO) missing.push(REQUIRED_FIELD_LABELS.dueAt);
  if (out.hasDesign === undefined) missing.push(REQUIRED_FIELD_LABELS.hasDesign);
  out.missing = missing;

  return out;
}

/** ready = safe to auto-create an order; needs_review = staff must confirm. */
export function intakeStatusFor(p: ParsedJobRequest): "needs_review" | "ready" | "not_a_job" {
  if (!p.isJobRequest) return "not_a_job";
  return p.missing.length === 0 ? "ready" : "needs_review";
}

/** Draft-only reply text — never sent automatically. */
export function buildDraftReply(opts: {
  orderNo?: string | null;
  finishAtText?: string | null;
  missing?: string[];
}): string {
  if (opts.missing && opts.missing.length > 0) {
    return `รับข้อความแล้วค่ะ 🙏 รบกวนขอข้อมูลเพิ่มเติมค่ะ:\n- ${opts.missing.join("\n- ")}`;
  }
  const lines = ["รับคำขอเรียบร้อยแล้วค่ะ 🙏"];
  if (opts.orderNo) lines.push(`เลขที่งาน: ${opts.orderNo}`);
  if (opts.finishAtText) lines.push(`คาดว่าเสร็จ: ${opts.finishAtText}`);
  lines.push("ทางร้านจะแจ้งความคืบหน้าให้ทราบอีกครั้งค่ะ");
  return lines.join("\n");
}
