/**
 * Film Shop — “รับงานผ่าน LINE OA” conversational intake (pure logic).
 *
 * Nothing here touches the network or the database: the webhook loads the
 * session row, calls `applyIntakeMessage`, then persists whatever comes back.
 * That keeps every branch unit-testable without a live LINE channel, and keeps
 * secrets/tokens out of this layer entirely.
 */

export type IntakeState = "customer" | "items" | "due" | "review";
export type IntakeStatus = "draft" | "confirmed" | "cancelled" | "expired";

export interface IntakeItem {
  category: string;
  title: string;
  quantity: number;
  size: string | null;
  outsource: boolean;
  note: string | null;
}

export interface IntakeSession {
  id?: string;
  state: IntakeState;
  status: IntakeStatus;
  isTest: boolean;
  customerName: string | null;
  customerPhone: string | null;
  items: IntakeItem[];
  attachments: { name: string; path: string }[];
  dueAt: string | null;
  notes: string | null;
}

export const MAX_ITEMS = 20;
/** ข้อความต่อผู้ใช้ต่อหน้าต่างเวลา (กันสแปม/ลูป) */
export const RATE_LIMIT_PER_WINDOW = 30;
export const RATE_WINDOW_MS = 60_000;

export function emptySession(isTest = false): IntakeSession {
  return {
    state: "customer",
    status: "draft",
    isTest,
    customerName: null,
    customerPhone: null,
    items: [],
    attachments: [],
    dueAt: null,
    notes: null,
  };
}

/* ------------------------------- commands -------------------------------- */

export type IntakeCommand =
  | { kind: "start"; isTest: boolean }
  | { kind: "check"; jobNo: string }
  | { kind: "confirm" }
  | { kind: "edit" }
  | { kind: "cancel" }
  | { kind: "items_done" }
  | { kind: "skip" }
  | null;

const norm = (t: string | null | undefined) => String(t ?? "").trim().replace(/\s+/g, " ");

export function parseIntakeCommand(text: string | null | undefined): IntakeCommand {
  const t = norm(text);
  if (!t) return null;
  const test = /^\[TEST\]\s*/i.test(t);
  const body = t.replace(/^\[TEST\]\s*/i, "");
  if (/^(สั่งงาน|รับงานใหม่|เปิดงานใหม่|แจ้งงานใหม่)$/.test(body)) return { kind: "start", isTest: test };
  const m = body.match(/^(?:เช็คคิว|เช็กคิว|ค้นหา|ติดตาม)\s*((?:JOB|OR)-[A-Za-z0-9-]+)$/i);
  if (m) return { kind: "check", jobNo: m[1].toUpperCase() };
  if (/^(ยืนยัน|ยืนยันงาน|confirm)$/i.test(body)) return { kind: "confirm" };
  if (/^(แก้ไข|แก้)$/.test(body)) return { kind: "edit" };
  if (/^(ยกเลิก|cancel)$/i.test(body)) return { kind: "cancel" };
  if (/^(จบรายการ|ครบแล้ว|เสร็จ|พอแล้ว)$/.test(body)) return { kind: "items_done" };
  if (/^(ไม่ระบุ|ข้าม|-)$/.test(body)) return { kind: "skip" };
  return null;
}

/* -------------------------------- parsing -------------------------------- */

const CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ["stationery", /เครื่องเขียน|สมุด|ปากกา|อุปกรณ์/],
  ["sign", /ไวนิล|ป้าย|สติ๊กเกอร์|สติกเกอร์|อิงค์เจ็ท|แบนเนอร์/],
  ["photo", /อัดรูป|ล้างรูป|ถ่ายรูป|รูปนักเรียน|โฟโต้/],
  ["doc", /ถ่ายเอกสาร|ปริ้น|พิมพ์เอกสาร|เข้าเล่ม|สำเนา/],
  ["print", /นามบัตร|โบรชัวร์|ใบปลิว|การ์ด|โปสเตอร์/],
];

export function detectCategory(text: string): string {
  const t = norm(text);
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(t)) return cat;
  return "other";
}

/** “ชื่อ 0812345678” / “คุณฟิล์ม, 081-234-5678” */
export function parseCustomerLine(text: string): { name: string | null; phone: string | null } {
  const t = norm(text).replace(/[,|]/g, " ");
  const pm = t.match(/(0\d[\d-\s]{7,12})/);
  const phone = pm ? pm[1].replace(/[^\d]/g, "") : null;
  const name = norm(t.replace(pm?.[1] ?? "", "")).replace(/^(ชื่อ|คุณ)\s*/, "") || null;
  return { name, phone: phone && phone.length >= 9 ? phone : null };
}

/**
 * “ไวนิล 2x1 เมตร 3 ผืน ส่งร้านใหญ่” หรือรูปแบบคั่นด้วย | :
 * หมวด | รายละเอียด | จำนวน | ขนาด
 */
export function parseItemLine(text: string): IntakeItem | null {
  const raw = norm(text);
  if (!raw) return null;
  const parts = raw.split("|").map((p) => norm(p)).filter(Boolean);
  const outsource = /ร้านใหญ่|ส่งนอก|outsource/i.test(raw);
  const clean = raw.replace(/ร้านใหญ่|ส่งนอก|outsource/gi, "").trim();

  if (parts.length >= 2) {
    const qty = Number(String(parts[2] ?? "1").replace(/[^\d.]/g, "")) || 1;
    return {
      category: detectCategory(parts[0]) === "other" ? detectCategory(parts[1]) : detectCategory(parts[0]),
      title: parts[1],
      quantity: Math.max(1, Math.round(qty)),
      size: parts[3] ?? null,
      outsource,
      note: parts[4] ?? null,
    };
  }

  const sizeM = clean.match(/(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ซม\.?|เมตร|ม\.?|cm|m|นิ้ว)?)/i);
  const qtyM = clean.match(/(\d+)\s*(ชิ้น|ใบ|แผ่น|ผืน|เล่ม|ชุด|อัน|ตัว|รูป)/);
  const quantity = qtyM ? Math.max(1, parseInt(qtyM[1], 10)) : 1;
  const title = norm(clean.replace(qtyM?.[0] ?? "", "")) || clean;
  return {
    category: detectCategory(clean),
    title: title.slice(0, 120),
    quantity,
    size: sizeM ? norm(sizeM[1]) : null,
    outsource,
    note: null,
  };
}

/** “พรุ่งนี้ 15:00”, “10/08 14:30”, “วันนี้” — คืน ISO หรือ null */
export function parseDueText(text: string, now: Date = new Date()): string | null {
  const t = norm(text);
  if (!t) return null;
  const bkkNow = new Date(now.getTime() + 7 * 3600_000);
  let y = bkkNow.getUTCFullYear();
  let mo = bkkNow.getUTCMonth() + 1;
  let d = bkkNow.getUTCDate();

  const dm = t.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (dm) {
    d = parseInt(dm[1], 10); mo = parseInt(dm[2], 10);
    if (dm[3]) {
      const yy = parseInt(dm[3], 10);
      y = yy > 2400 ? yy - 543 : yy < 100 ? 2000 + yy : yy;
    }
  } else if (/พรุ่งนี้/.test(t)) {
    const n = new Date(Date.UTC(y, mo - 1, d + 1));
    y = n.getUTCFullYear(); mo = n.getUTCMonth() + 1; d = n.getUTCDate();
  } else if (/มะรืน/.test(t)) {
    const n = new Date(Date.UTC(y, mo - 1, d + 2));
    y = n.getUTCFullYear(); mo = n.getUTCMonth() + 1; d = n.getUTCDate();
  } else if (!/วันนี้|เย็นนี้|บ่ายนี้/.test(t)) {
    return null;
  }

  const tm = t.match(/(\d{1,2})[:.](\d{2})/);
  const hh = tm ? parseInt(tm[1], 10) : 17;
  const mm = tm ? parseInt(tm[2], 10) : 0;
  const utc = Date.UTC(y, mo - 1, d, hh - 7, mm);
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

/* ------------------------------ attachments ------------------------------ */

export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic",
  "application/pdf",
];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function validateAttachment(input: { mime?: string | null; bytes?: number | null }):
  { ok: true } | { ok: false; reason: string } {
  const mime = String(input.mime ?? "").toLowerCase().split(";")[0];
  if (!ALLOWED_ATTACHMENT_TYPES.includes(mime)) return { ok: false, reason: "ชนิดไฟล์ไม่รองรับ (รับเฉพาะรูปภาพและ PDF)" };
  const bytes = Number(input.bytes ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, reason: "ไฟล์เสียหาย" };
  if (bytes > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "ไฟล์ใหญ่เกิน 10MB" };
  return { ok: true };
}

/** ชื่อไฟล์ปลอดภัย: ไม่มี path traversal / อักขระแปลก และไม่มีข้อมูลส่วนตัว */
export function safeAttachmentName(original: string | null | undefined, mime: string, seq: number): string {
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const base = String(original ?? "").replace(/[^\w.-]+/g, "-").replace(/\.+/g, ".").replace(/^[-.]+/, "").slice(0, 40);
  return `${String(seq).padStart(2, "0")}-${base || "file"}`.replace(/\.[^.]*$/, "") + `.${ext}`;
}

/* ------------------------------ rate limiting ---------------------------- */

export function rateWindowStart(now: Date = new Date()): string {
  return new Date(Math.floor(now.getTime() / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
}
export function isRateLimited(hits: number): boolean {
  return hits > RATE_LIMIT_PER_WINDOW;
}

/* ------------------------------ state machine ---------------------------- */

export interface ApplyResult {
  session: IntakeSession;
  /** ข้อความตอบกลับ (ข้อความล้วน) */
  reply: string | null;
  /** ให้ webhook ส่งการ์ดสรุปรอยืนยัน */
  showReview: boolean;
  /** ให้ webhook เรียก film_confirm_order */
  confirm: boolean;
  cancelled: boolean;
}

const ASK_CUSTOMER = "รับงานใหม่ค่ะ 📝\nขั้นที่ 1/3 — พิมพ์ชื่อลูกค้าและเบอร์โทร\nตัวอย่าง: คุณฟิล์ม 0812345678";
const ASK_ITEMS = "ขั้นที่ 2/3 — พิมพ์รายการงานทีละบรรทัด (ส่งได้หลายข้อความ)\nตัวอย่าง: ไวนิล 2x1 เมตร 3 ผืน\nแนบรูป/ไฟล์งานได้เลยค่ะ\nพิมพ์ “จบรายการ” เมื่อครบ";
const ASK_DUE = "ขั้นที่ 3/3 — กำหนดส่งเมื่อไหร่คะ\nตัวอย่าง: พรุ่งนี้ 15:00 หรือ 12/08 10:00\nพิมพ์ “ไม่ระบุ” ถ้ายังไม่กำหนด";

export function applyIntakeMessage(
  current: IntakeSession | null,
  text: string,
  now: Date = new Date(),
): ApplyResult {
  const cmd = parseIntakeCommand(text);

  if (cmd?.kind === "start") {
    return { session: emptySession(cmd.isTest), reply: ASK_CUSTOMER, showReview: false, confirm: false, cancelled: false };
  }
  if (!current || current.status !== "draft") {
    return { session: current ?? emptySession(), reply: null, showReview: false, confirm: false, cancelled: false };
  }
  const s: IntakeSession = { ...current, items: [...current.items], attachments: [...current.attachments] };

  if (cmd?.kind === "cancel") {
    return { session: { ...s, status: "cancelled" }, reply: "ยกเลิกใบรับงานชั่วคราวแล้วค่ะ พิมพ์ “สั่งงาน” เพื่อเริ่มใหม่", showReview: false, confirm: false, cancelled: true };
  }
  if (cmd?.kind === "edit") {
    return { session: { ...s, state: "items", items: [] }, reply: `แก้ไขรายการงานได้เลยค่ะ\n${ASK_ITEMS}`, showReview: false, confirm: false, cancelled: false };
  }
  if (cmd?.kind === "confirm") {
    if (s.state !== "review") {
      return { session: s, reply: "ยังกรอกข้อมูลไม่ครบค่ะ กรุณาทำตามขั้นตอนก่อนยืนยัน", showReview: false, confirm: false, cancelled: false };
    }
    return { session: s, reply: null, showReview: false, confirm: true, cancelled: false };
  }

  switch (s.state) {
    case "customer": {
      const { name, phone } = parseCustomerLine(text);
      if (!name && !phone) {
        return { session: s, reply: "ขอชื่อลูกค้าและเบอร์โทรอีกครั้งค่ะ\nตัวอย่าง: คุณฟิล์ม 0812345678", showReview: false, confirm: false, cancelled: false };
      }
      s.customerName = name ?? s.customerName;
      s.customerPhone = phone ?? s.customerPhone;
      s.state = "items";
      return { session: s, reply: ASK_ITEMS, showReview: false, confirm: false, cancelled: false };
    }
    case "items": {
      if (cmd?.kind === "items_done") {
        if (s.items.length === 0) {
          return { session: s, reply: "ยังไม่มีรายการงานค่ะ พิมพ์รายการอย่างน้อย 1 บรรทัดก่อนนะคะ", showReview: false, confirm: false, cancelled: false };
        }
        s.state = "due";
        return { session: s, reply: ASK_DUE, showReview: false, confirm: false, cancelled: false };
      }
      if (s.items.length >= MAX_ITEMS) {
        return { session: s, reply: `รับได้สูงสุด ${MAX_ITEMS} รายการต่อ 1 ออเดอร์ค่ะ พิมพ์ “จบรายการ” เพื่อไปขั้นถัดไป`, showReview: false, confirm: false, cancelled: false };
      }
      const item = parseItemLine(text);
      if (!item) return { session: s, reply: null, showReview: false, confirm: false, cancelled: false };
      s.items.push(item);
      return {
        session: s,
        reply: `เพิ่มรายการที่ ${s.items.length}: ${item.title} × ${item.quantity}${item.outsource ? " (ส่งร้านใหญ่)" : ""}\nพิมพ์รายการถัดไป หรือ “จบรายการ”`,
        showReview: false, confirm: false, cancelled: false,
      };
    }
    case "due": {
      const due = cmd?.kind === "skip" ? null : parseDueText(text, now);
      if (cmd?.kind !== "skip" && !due) {
        return { session: s, reply: "อ่านกำหนดส่งไม่ออกค่ะ ลองพิมพ์ เช่น “พรุ่งนี้ 15:00” หรือ “ไม่ระบุ”", showReview: false, confirm: false, cancelled: false };
      }
      s.dueAt = due;
      s.state = "review";
      return { session: s, reply: null, showReview: true, confirm: false, cancelled: false };
    }
    case "review":
      return { session: s, reply: "กดปุ่ม ยืนยัน / แก้ไข / ยกเลิก ที่การ์ดด้านบนได้เลยค่ะ", showReview: false, confirm: false, cancelled: false };
  }
}

/* -------------------------------- Flex ---------------------------------- */

const PLUM = "#5B2A4E";

export const CATEGORY_LABELS: Record<string, string> = {
  stationery: "เครื่องเขียน",
  sign: "ป้าย/ไวนิล",
  photo: "อัดรูป",
  doc: "ถ่ายเอกสาร",
  print: "งานพิมพ์",
  other: "อื่น ๆ",
};

export function formatBkk(iso: string | null | undefined): string {
  if (!iso) return "ยังไม่กำหนด";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "ยังไม่กำหนด";
  const d = new Date(t + 7 * 3600_000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} น.`;
}

/** ใบรับงานชั่วคราว — ยังไม่ออกเอกสารจริง ไม่มีเลขเอกสาร */
export function buildReviewFlex(session: IntakeSession, sessionId: string): Record<string, unknown> {
  const rows = session.items.map((it, i) => ({
    type: "box", layout: "vertical", spacing: "none",
    contents: [
      { type: "text", text: `${i + 1}. ${it.title} × ${it.quantity}`, size: "sm", wrap: true, weight: "bold" },
      {
        type: "text",
        text: [CATEGORY_LABELS[it.category] ?? it.category, it.size, it.outsource ? "ส่งร้านใหญ่" : "ทำในร้าน"].filter(Boolean).join(" · "),
        size: "xs", color: "#8A8A8A", wrap: true,
      },
    ],
  }));
  return {
    type: "flex",
    altText: "ใบรับงานชั่วคราว — รอยืนยัน",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: PLUM, paddingAll: "16px",
        contents: [
          { type: "text", text: session.isTest ? "[TEST] ใบรับงานชั่วคราว" : "ใบรับงานชั่วคราว", color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: "ยังไม่ออกเอกสารจริง — โปรดตรวจสอบ", color: "#F3D9EC", size: "xs", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: `ลูกค้า: ${session.customerName ?? "-"}${session.customerPhone ? ` (${session.customerPhone})` : ""}`, size: "sm", wrap: true },
          { type: "text", text: `กำหนดส่ง: ${formatBkk(session.dueAt)}`, size: "sm" },
          { type: "text", text: `ไฟล์แนบ: ${session.attachments.length} ไฟล์`, size: "sm", color: session.attachments.length ? "#2E7D32" : "#B26A00" },
          { type: "separator", margin: "md" },
          ...rows,
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "button", style: "primary", color: PLUM, action: { type: "postback", label: "ยืนยันเปิดงาน", data: `film_intake:confirm:${sessionId}`, displayText: "ยืนยัน" } },
          { type: "button", style: "secondary", action: { type: "postback", label: "แก้ไขรายการ", data: `film_intake:edit:${sessionId}`, displayText: "แก้ไข" } },
          { type: "button", style: "link", action: { type: "postback", label: "ยกเลิก", data: `film_intake:cancel:${sessionId}`, displayText: "ยกเลิก" } },
        ],
      },
    },
  };
}

export function buildConfirmedFlex(input: {
  orderNo: string;
  jobs: { jobNo: string; title: string; status: string }[];
  dueAt: string | null;
  trackUrl: string | null;
  isTest?: boolean;
}): Record<string, unknown> {
  return {
    type: "flex",
    altText: `เปิดงาน ${input.orderNo} เรียบร้อย`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: PLUM, paddingAll: "16px",
        contents: [
          { type: "text", text: input.isTest ? `[TEST] ${input.orderNo}` : input.orderNo, color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: "รับงานเข้าคิวเรียบร้อยแล้ว", color: "#F3D9EC", size: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: `กำหนดส่ง: ${formatBkk(input.dueAt)}`, size: "sm" },
          { type: "separator", margin: "sm" },
          ...input.jobs.map((j) => ({
            type: "text",
            text: `${j.jobNo} · ${j.title} · ${j.status}`,
            size: "xs", wrap: true, color: "#4A4A4A",
          })),
        ],
      },
      ...(input.trackUrl
        ? {
            footer: {
              type: "box", layout: "vertical",
              contents: [{ type: "button", style: "primary", color: PLUM, action: { type: "uri", label: "ติดตามสถานะงาน", uri: input.trackUrl } }],
            },
          }
        : {}),
    },
  };
}

/** postback ของ flow รับงาน: film_intake:<action>:<sessionId> */
export function parseIntakePostback(data: string | null | undefined):
  { action: "confirm" | "edit" | "cancel"; sessionId: string } | null {
  const m = String(data ?? "").match(/^film_intake:(confirm|edit|cancel):([0-9a-f-]{36})$/i);
  return m ? { action: m[1] as "confirm" | "edit" | "cancel", sessionId: m[2] } : null;
}
