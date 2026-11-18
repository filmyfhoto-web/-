/**
 * ม่วงจดให้ — ผู้ช่วยบัญชีผ่าน LINE (เฉพาะ Film Shop, ช่อง `natta`)
 *
 * โมดูลนี้เป็น "ตัวแปลคำสั่ง" ล้วน ๆ ไม่มีการต่อฐานข้อมูล เพื่อให้ทดสอบได้ตรง ๆ
 * และให้ webhook กับหน้าเว็บตีความข้อความเหมือนกันทุกที่
 *
 * ขอบเขต: ใช้กับแชทส่วนตัวของเจ้าของ/แอดมิน Film Shop เท่านั้น
 * ไม่เกี่ยวกับร้านคัลเลอร์แล็ป/การพิมพ์ และไม่ยุ่งกับแชทลูกค้า
 *
 * ชื่อไฟล์/ฟังก์ชันยังใช้คำว่า natta เพื่อความเข้ากันได้ย้อนหลัง
 * แต่ข้อความที่ผู้ใช้เห็นทั้งหมดคือแบรนด์ใหม่ "ม่วงจดให้"
 */

export const BRAND = "ม่วงจดให้";
export const BRAND_TAGLINE = "ม่วงจำให้ • ม่วงจดให้";

export type NattaTxType = "income" | "expense";

export type PaymentMethod = "cash" | "transfer" | "promptpay" | "card" | "ewallet" | "other";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "เงินสด",
  transfer: "โอน",
  promptpay: "พร้อมเพย์",
  card: "บัตร",
  ewallet: "e-wallet",
  other: "อื่นๆ",
};

/** คำที่ใช้เดาวิธีจ่าย — เรียงจากเฉพาะเจาะจงไปหากว้าง */
const PAYMENT_WORDS: Array<[PaymentMethod, RegExp]> = [
  ["promptpay", /(พร้อมเพย์|พร้อมเพ|promptpay)/i],
  ["ewallet", /(ทรูมันนี่|truemoney|true\s?money|วอลเล็ต|wallet|e-?wallet|tiktok\s?pay|shopee\s?pay|rabbit\s?line\s?pay)/i],
  ["card", /(บัตรเครดิต|รูดบัตร|บัตรเดบิต|จ่ายบัตร|credit\s?card|debit\s?card|\bบัตร\b)/i],
  ["transfer", /(เงินโอน|โอนเงิน|สแกนจ่าย|transfer|\bqr\b|\bโอน\b)/i],
  ["cash", /(เงินสด|จ่ายสด|รับสด|\bcash\b|\bสด\b)/i],
];

/** อ่านวิธีจ่ายจากข้อความ แล้วคืนข้อความที่ตัดคำวิธีจ่ายออกแล้ว */
export function detectPaymentMethod(text: string): { method: PaymentMethod | null; rest: string } {
  let rest = String(text ?? "");
  let method: PaymentMethod | null = null;
  for (const [m, re] of PAYMENT_WORDS) {
    if (re.test(rest)) {
      method = method ?? m;
      rest = rest.replace(new RegExp(re.source, "gi"), " ");
    }
  }
  return { method, rest: rest.replace(/\s+/g, " ").trim() };
}

export type NattaCommand =
  | { kind: "help" }
  | { kind: "summary_today" }
  | { kind: "summary_month" }
  | { kind: "category_today" }
  | { kind: "list_recent" }
  | { kind: "add"; type: NattaTxType; amount: number; description: string; category: string; note?: string; payment?: PaymentMethod }
  | { kind: "ask_type"; amount: number; description: string; note?: string; payment?: PaymentMethod }
  | { kind: "today_menu" }
  | { kind: "attach_request" }
  | { kind: "edit_latest_menu" }
  | { kind: "edit_latest"; amount: number }
  | { kind: "edit_latest_desc"; description: string }
  | { kind: "edit_latest_payment"; payment: PaymentMethod }
  | { kind: "payment_menu" }
  | { kind: "draft_type"; type: NattaTxType }
  | { kind: "delete_latest" }
  | { kind: "outstanding" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "deposit"; orderNo: string; amount: number }
  | { kind: "deposit_help" };


/** คำเรียกผู้ช่วย — เก็บชื่อเดิมไว้เพื่อความเข้ากันได้ย้อนหลังเท่านั้น */
const HELP_TRIGGERS = [
  "ม่วงจดให้",
  "ม่วงจำให้",
  "ช่วยเหลือ",
  "ช่วยเหลือม่วงจดให้",
  "วิธีใช้",
  "ช่วยบัญชี",
  // legacy (ไม่แสดงในเมนู/คำตอบใหม่)
  "น้องนัตต้า",
  "ช่วยเหลือน้องนัตต้า",
  "นัตต้าช่วยด้วย",
];

export const NATTA_HELP_TEXT = [
  `🧾 ${BRAND} — ผู้ช่วยบัญชีร้าน`,
  BRAND_TAGLINE,
  "",
  "บันทึกรายรับ:",
  "• ขายรูป 360",
  "• รับเงิน งานป้าย 1200",
  "",
  "บันทึกรายจ่าย:",
  "• ซื้อกระดาษ 625",
  "• ค่าส่ง 80",
  "",
  "ทุกครั้งจะขึ้นการ์ด “รอยืนยัน” ก่อน — กด ✅ ยืนยันบันทึก แล้วจึงบันทึกจริง",
  "",
  "ปุ่มลัด:",
  "• บันทึกงานวันนี้ (การ์ดปุ่มลัด กดแล้วพิมพ์แค่ยอดเงิน)",
  "",
  "แนบหลักฐาน:",
  "• พิมพ์ “แนบสลิป” ตอนมีการ์ดรอยืนยัน แล้วส่งรูป/ไฟล์เข้ามา",
  "",
  "ดูข้อมูล:",
  "• สรุปวันนี้",
  "• รายการล่าสุด",
  "• ค้างรับ",
  "",
  "แก้ไข/ยกเลิก (ต้องยืนยันก่อน):",
  "• แก้ไขล่าสุด",
  "• แก้ล่าสุดเป็น 650",
  "• แก้รายละเอียดล่าสุด งานรูปด่วน ลูกค้าโอนแล้ว",
  "• ยกเลิกล่าสุด",
  "",
  "มัดจำงาน:",
  "• มัดจำ ORD-1234 500",
].join("\n");

/** ตัดคำฟุ่มเฟือย + normalize ช่องว่าง */
function norm(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** อ่านจำนวนเงินตัวสุดท้ายในข้อความ เช่น "ขายรูป 1,200 บาท" → 1200 */
export function parseAmount(text: string): number | null {
  const matches = norm(text).match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (!matches?.length) return null;
  const raw = matches[matches.length - 1].replace(/,/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

const INCOME_CATEGORIES: Array<[string, string[]]> = [
  ["งานถ่ายรูป", ["รูป", "ถ่าย", "ภาพ", "โฟโต้", "photo", "อัดรูป"]],
  ["งานพิมพ์/ป้าย", ["ป้าย", "ไวนิล", "พิมพ์", "สติกเกอร์", "อิงค์เจ็ท", "โบรชัวร์", "นามบัตร"]],
  ["ขายสินค้า", ["ขายสินค้า", "ขายของ", "สินค้า", "กรอบ", "อัลบั้ม"]],
];

const EXPENSE_CATEGORIES: Array<[string, string[]]> = [
  ["วัสดุงานพิมพ์", ["กระดาษ", "หมึก", "อิงค์", "ฟิล์ม", "เคลือบ", "ไวนิล", "สติกเกอร์"]],
  ["วัสดุสำนักงาน", ["ปากกา", "แฟ้ม", "คลิป", "เครื่องเขียน", "กรรไกร", "เทป", "ลวดเย็บ"]],
  ["ค่าขนส่ง", ["ค่าส่ง", "ขนส่ง", "ส่งของ", "ไปรษณีย์", "แมส", "เคอรี่", "แกร็บ", "น้ำมัน"]],
  ["ค่าใช้จ่ายทั่วไป", ["ค่าไฟ", "ค่าน้ำ", "ค่าเช่า", "ค่าเน็ต", "ค่าโทรศัพท์", "ค่าแรง", "เงินเดือน"]],
];

/** เดาหมวดจากคำในข้อความ (ไม่พบ → "อื่นๆ") */
export function detectCategory(text: string, type: NattaTxType): string {
  const t = norm(text).toLowerCase();
  const ordered = type === "income"
    ? [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
    : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  for (const [cat, words] of ordered) {
    if (words.some((w) => t.includes(w.toLowerCase()))) {
      // หมวดฝั่งตรงข้ามใช้ได้เฉพาะเมื่อยังไม่มีหมวดตรงประเภท
      if (type === "income" && EXPENSE_CATEGORIES.some(([c]) => c === cat)) {
        if (cat === "ค่าขนส่ง" || cat === "ค่าใช้จ่ายทั่วไป") return "อื่นๆ";
      }
      return cat;
    }
  }
  return "อื่นๆ";
}

const INCOME_PREFIX = /^(รายรับ|รับเงิน|รายได้|เงินเข้า)\s*/;
const EXPENSE_PREFIX = /^(รายจ่าย|จ่ายเงิน|จ่าย|เงินออก|ค่าใช้จ่าย)\s*/;

function inferType(text: string): { type: NattaTxType; body: string } | null {
  const t = norm(text);
  if (INCOME_PREFIX.test(t)) return { type: "income", body: t.replace(INCOME_PREFIX, "") };
  if (EXPENSE_PREFIX.test(t)) return { type: "expense", body: t.replace(EXPENSE_PREFIX, "") };
  if (/^(ขาย|รับ|ได้เงิน)/.test(t)) return { type: "income", body: t };
  if (/^(ซื้อ|ค่า|เติม|จ้าง)/.test(t)) return { type: "expense", body: t };
  return null;
}

/** ข้อความรายละเอียด = ตัดจำนวนเงินตัวท้าย + คำว่า "บาท" ออก */
export function extractDescription(body: string): string {
  return norm(
    norm(body)
      .replace(/-?\d[\d,]*(?:\.\d+)?\s*(บาท)?\s*$/i, "")
      .replace(/\s*บาท\s*$/i, ""),
  );
}

/** แยก "หมายเหตุ ..." ออกจากข้อความหลัก เพื่อไม่ให้ตัวเลขในหมายเหตุกลายเป็นยอดเงิน */
export function splitNote(input: string): { body: string; note?: string } {
  const t = norm(input);
  const m = t.match(/\s*(?:หมายเหตุ|โน้ต|note)\s*[:：]?\s*(.+)$/i);
  if (!m) return { body: t };
  const note = norm(m[1]);
  const body = norm(t.slice(0, m.index ?? t.length));
  if (!body) return { body: t };
  return { body, note: note || undefined };
}

export function parseNattaCommand(input: string): NattaCommand | null {
  const t = norm(input);
  if (!t) return null;

  if (HELP_TRIGGERS.some((h) => t === h || t.startsWith(h + " ") || t === h + "?")) {
    return { kind: "help" };
  }
  if (/^(สรุปวันนี้|ยอดวันนี้|สรุปยอดวันนี้)$/.test(t)) return { kind: "summary_today" };
  if (/^(สรุปเดือนนี้|ยอดเดือนนี้|สรุปยอดเดือนนี้|สรุปรายเดือน)$/.test(t)) return { kind: "summary_month" };
  if (/^(หมวดวันนี้|สรุปหมวดวันนี้|หมวดหมู่วันนี้|สรุปตามหมวด)$/.test(t)) return { kind: "category_today" };
  if (/^(รายการวันนี้|รายการล่าสุด|ดูรายการ)$/.test(t)) return { kind: "list_recent" };
  if (/^(งานวันนี้|บันทึกงานวันนี้|เมนูงานวันนี้|บันทึกงาน|ปุ่มลัด|เมนูลัด)$/.test(t)) return { kind: "today_menu" };
  if (/^(แนบสลิป|แนบหลักฐาน|แนบสลิป\/หลักฐาน|แนบไฟล์|แนบหลักฐานเพิ่ม)$/.test(t)) return { kind: "attach_request" };
  if (/^(ค้างรับ|ค้างรับ & ติดตามงาน|ค้างรับและติดตามงาน|ติดตามงาน|ยอดค้างรับ)$/.test(t)) {
    return { kind: "outstanding" };
  }

  // แก้วิธีจ่ายของรายการล่าสุด
  const editPay = t.match(/^(?:แก้(?:ไข)?)?วิธี(?:การ)?จ่าย(?:ล่าสุด)?(?:เป็น)?\s*(.*)$/);
  if (editPay) {
    const { method } = detectPaymentMethod(editPay[1] || "");
    if (method) return { kind: "edit_latest_payment", payment: method };
    return { kind: "payment_menu" };
  }

  // แก้รายละเอียดล่าสุด <ข้อความ>
  const editDesc = t.match(/^แก้(?:ไข)?(?:รายละเอียด|ชื่อรายการ|โน้ต|หมายเหตุ)(?:ล่าสุด)?\s*(.*)$/);
  if (editDesc) {
    const desc = norm(editDesc[1]);
    if (desc) return { kind: "edit_latest_desc", description: desc.slice(0, 200) };
    return { kind: "edit_latest_menu" };
  }

  const edit = t.match(/^แก้(?:ไข)?(?:ยอด)?(?:รายการ)?ล่าสุด(?:เป็น|เป็นยอด|ยอด)?\s*([\d,]+(?:\.\d+)?)/) ||
    t.match(/^แก้ยอด(?:เป็น)?\s*([\d,]+(?:\.\d+)?)/);
  if (edit) {
    const amount = parseAmount(edit[1]);
    if (amount) return { kind: "edit_latest", amount };
  }
  if (/^(แก้ไขล่าสุด|แก้ล่าสุด|แก้รายการล่าสุด|แก้ยอด)$/.test(t)) return { kind: "edit_latest_menu" };
  if (/^(ยกเลิกล่าสุด|ลบรายการล่าสุด|ลบล่าสุด|ยกเลิกรายการล่าสุด)$/.test(t)) return { kind: "delete_latest" };
  if (/^ประเภท\s*รายรับ$/.test(t)) return { kind: "draft_type", type: "income" };
  if (/^ประเภท\s*รายจ่าย$/.test(t)) return { kind: "draft_type", type: "expense" };
  if (/^(ยืนยัน|ตกลง|ยืนยันค่ะ|ยืนยันครับ|ยืนยันบันทึก)$/.test(t)) return { kind: "confirm" };
  if (/^(ยกเลิก|ไม่เอา|ยกเลิกค่ะ|ยกเลิกครับ)$/.test(t)) return { kind: "cancel" };

  if (/มัดจำ/.test(t)) {
    const m = t.match(/มัดจำ\s*([A-Za-z][A-Za-z0-9\-_/]{2,})\s*([\d,]+(?:\.\d+)?)/) ||
      t.match(/([A-Za-z][A-Za-z0-9\-_/]{2,})\s*มัดจำ\s*([\d,]+(?:\.\d+)?)/);
    if (m) {
      const amount = parseAmount(m[2]);
      if (amount) return { kind: "deposit", orderNo: m[1].toUpperCase(), amount };
    }
    return { kind: "deposit_help" };
  }

  const { body: rawBody, note } = splitNote(t);
  const { method: payment, rest: mainText } = detectPaymentMethod(rawBody);
  const guess = inferType(mainText);
  if (!guess) {
    // ไม่รู้ว่ารายรับหรือรายจ่าย — ถ้ามีทั้งยอดและคำอธิบายให้ถามกลับ ไม่เดาเอง
    const amount = parseAmount(mainText);
    const description = extractDescription(mainText);
    if (amount && description) {
      return {
        kind: "ask_type",
        amount,
        description: description.slice(0, 200),
        ...(note ? { note } : {}),
        ...(payment ? { payment } : {}),
      };
    }
    return null;
  }
  const amount = parseAmount(guess.body);
  if (!amount) return null;
  const description = extractDescription(guess.body) || (guess.type === "income" ? "รายรับ" : "รายจ่าย");
  return {
    kind: "add",
    type: guess.type,
    amount,
    description,
    category: detectCategory(description, guess.type),
    ...(note ? { note } : {}),
    ...(payment ? { payment } : {}),
  };
}


/* ------------------------------- postback -------------------------------- */

export type NattaPostback =
  | { kind: "confirm"; pendingId: string }
  | { kind: "cancel"; pendingId: string }
  | { kind: "attach"; pendingId: string }
  | { kind: "text"; text: string }
  | { kind: "fill" };

/** `natta:confirm:<id>` / `natta:cancel:<id>` / `natta:attach:<id>` / `natta:text:<คำสั่ง>` */
export function parseNattaPostback(data: string): NattaPostback | null {
  const raw = String(data ?? "");
  if (!raw.startsWith("natta")) return null;
  if (raw.startsWith("natta_fill:")) return { kind: "fill" };
  const parts = raw.split(":");
  if (parts[0] !== "natta") return null;
  const act = parts[1] ?? "";
  const rest = parts.slice(2).join(":");
  if (act === "confirm" && rest) return { kind: "confirm", pendingId: rest };
  if (act === "cancel" && rest) return { kind: "cancel", pendingId: rest };
  if (act === "attach" && rest) return { kind: "attach", pendingId: rest };
  if (act === "text" && rest) return { kind: "text", text: rest };
  return null;
}

/** วันที่ปัจจุบันตามเวลาไทย (Asia/Bangkok) รูปแบบ YYYY-MM-DD */
export function bangkokDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function formatBaht(n: number): string {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export interface NattaTxRow {
  type: string;
  category: string | null;
  description: string | null;
  amount: number;
  date?: string | null;
  created_at?: string | null;
}

export function buildSummaryText(rows: NattaTxRow[], dateStr: string): string {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if (r.type === "income") income += amt;
    else expense += amt;
  }
  const net = income - expense;
  return [
    `📊 สรุปวันนี้ (${dateStr})`,
    `รายรับ: ${formatBaht(income)} บาท`,
    `รายจ่าย: ${formatBaht(expense)} บาท`,
    `คงเหลือ: ${formatBaht(net)} บาท`,
  ].join("\n");
}

export function buildListText(rows: NattaTxRow[]): string {
  if (!rows.length) return "ยังไม่มีรายการบัญชีในระบบค่ะ";
  const lines = rows.map((r, i) => {
    const sign = r.type === "income" ? "🟢 +" : "🔴 -";
    const cat = r.category ? ` [${r.category}]` : "";
    return `${i + 1}. ${sign}${formatBaht(Number(r.amount) || 0)} ${r.description ?? "-"}${cat}`;
  });
  return ["📋 รายการล่าสุด", ...lines].join("\n");
}

export const NATTA_DEPOSIT_HELP =
  `ระบุเลขที่งานด้วยนะคะ เช่น “มัดจำ ORD-1234 500”\n(${BRAND}จะไม่เดาชื่อลูกค้าหรือเลขงานให้ค่ะ)`;

export const NATTA_NO_PERMISSION =
  "ขออภัยค่ะ คำสั่งบัญชีนี้ใช้ได้เฉพาะเจ้าของร้าน/แอดมินที่ผูกสิทธิ์ไว้แล้วเท่านั้น";

export const NATTA_ATTACH_NO_DRAFT =
  `ยังไม่มีรายการที่รอยืนยันค่ะ\nเริ่มจากพิมพ์ “บันทึกงานวันนี้” หรือพิมพ์รายการ เช่น “ขายรูป 360” แล้วค่อยส่งสลิป/หลักฐานเข้ามานะคะ`;

export const VOID_REASON = `ยกเลิกผ่าน LINE (${BRAND})`;
