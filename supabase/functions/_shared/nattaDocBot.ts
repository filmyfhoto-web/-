/**
 * NATTA DOC BOT — Flex Message + ตัวช่วยล้วน (pure) สำหรับกลุ่ม LINE ของพนักงาน
 *
 * ใช้กับ “ห้องเอกสารเท่านั้น” (doc_group) ที่ผูกกับร้านผ่าน room mapping
 * บอทนี้ออกเอกสารอย่างเดียว: ไม่มีคิวงาน ไม่ตัดสต๊อก ไม่ส่งเอกสารหาลูกค้าอัตโนมัติ
 */
import type { DocBotCommand, DocBotDocType } from "./docBotCommands.ts";

export type NdbShopKey = "film" | "colorlab" | "printing";

export interface NdbTheme {
  primary: string;
  secondary: string;
  label: string;
}

export const NDB_THEME: Record<NdbShopKey, NdbTheme> = {
  colorlab: { primary: "#E8631A", secondary: "#6B7280", label: "นัฐภรณ์ คัลเลอร์แล็ป" },
  printing: { primary: "#1DA65C", secondary: "#6B7280", label: "นัฐภรณ์ การพิมพ์" },
  film: { primary: "#0F766E", secondary: "#6B7280", label: "FILM SHOP" },
};

export const NDB_TITLE = "NATTA DOC BOT";

/** พาธหน้า “ใบเสร็จฟิล์มชอป” บนเว็บแอป (ใช้เฉพาะห้อง/ร้าน FILM SHOP) */
export const NDB_FILM_RECEIPTS_PATH = "/receipts/film";
/** โดเมนสำรองเมื่อไม่ทราบ origin ของร้าน (ปกติบอทจะใช้ appOrigin ของร้านจริง) */
export const NDB_DEFAULT_ORIGIN = "https://filmyynatta.com";

/** ลิงก์หน้า “ใบเสร็จฟิล์มชอป” (ค่า default — ให้ใช้ filmQueueUrls(appOrigin) แทนเมื่อรู้ร้านจริง) */
export const NDB_FILM_RECEIPTS_URL = `${NDB_DEFAULT_ORIGIN}${NDB_FILM_RECEIPTS_PATH}`;

/** ลิงก์ Q รันงานของร้านจริง — คิดจาก origin ที่ webhook ส่งมา ไม่ hardcode โดเมนเดิม */
export function filmQueueUrls(appOrigin?: string | null) {
  const base = `${String(appOrigin || NDB_DEFAULT_ORIGIN).replace(/\/+$/, "")}${NDB_FILM_RECEIPTS_PATH}`;
  return {
    intake: `${base}?p=group-queue&q=intake`,
    queue: `${base}?p=group-queue`,
    docs: `${base}?p=group-queue&q=documents`,
  };
}

/** จุดรับงานเดียวของ Film Shop — เปิด “รับงานใหม่” ในหน้า Q รันงาน (สร้าง Q + ใบสั่งจ้างพร้อมกัน) */
export const NDB_FILM_QUEUE_INTAKE_URL = `${NDB_FILM_RECEIPTS_URL}?p=group-queue&q=intake`;
/** หน้า Q รันงาน (จุดเดียวของ Film Shop) */
export const NDB_FILM_QUEUE_URL = `${NDB_FILM_RECEIPTS_URL}?p=group-queue`;
/** เอกสารทั้งหมดของ Film Shop — เปิดในหน้า Q */
export const NDB_FILM_QUEUE_DOCS_URL = `${NDB_FILM_RECEIPTS_URL}?p=group-queue&q=documents`;
/**
 * ลิงก์เดิม (deprecated) — คงชื่อไว้เพื่อความเข้ากันได้ย้อนหลัง
 * แต่ทั้งหมด alias มาที่ flow Q แล้ว ห้ามชี้กลับหน้าเดิม
 */
export const NDB_FILM_DOC_HELPER_URL = NDB_FILM_QUEUE_INTAKE_URL;
export const NDB_FILM_JOB_ORDER_URL = NDB_FILM_QUEUE_DOCS_URL;
export const NDB_FILM_RECEIPT_URL = NDB_FILM_QUEUE_DOCS_URL;

/** ข้อความแนะนำเฉพาะ Film Shop — ออกได้แค่ใบสั่งจ้างและใบเสร็จรับเงิน */
export const NDB_INTRO_FILM =
  "กด “รับงานใหม่ (Q + เอกสาร)” เพื่อกรอกครั้งเดียว ระบบจะสร้างงานในคิวและใบสั่งจ้างให้พร้อมกัน (ออกใบเสร็จเพิ่มเมื่อเลือกจ่ายครบ) บอทจะไม่สร้างเอกสารจริงจนกว่าพนักงานจะกดยืนยัน";

export const NDB_INTRO =
  "ส่งข้อความ รูปภาพ หรือไฟล์เอกสารได้เลย บอทจะอ่านข้อมูลและจัดทำร่างใบเสนอราคาให้ตรวจสอบ บอทจะไม่สร้างเอกสารจริงจนกว่าพนักงานจะกดยืนยัน";

export const NDB_QUOTATION_REQUIRED =
  "ยังไม่สามารถออกเอกสารนี้ได้ ระบบกำหนดให้ทุกงานต้องมีใบเสนอราคาและได้รับการยืนยันก่อน";

/** เอกสารต่อเนื่องที่แต่ละร้านออกได้หลังใบเสนอราคาได้รับการยืนยัน */
export const NDB_NEXT_DOCS: Record<NdbShopKey, { type: DocBotDocType | "delivery_receipt"; label: string }[]> = {
  colorlab: [
    { type: "delivery_note", label: "ออกใบส่งของ" },
    { type: "tax_receipt", label: "ออกใบเสร็จรับเงิน/ใบกำกับภาษี" },
  ],
  printing: [
    { type: "delivery_note", label: "ออกใบส่งของ" },
    { type: "receipt", label: "ออกใบเสร็จรับเงิน" },
    { type: "delivery_receipt", label: "ออกใบส่งของ + ใบเสร็จ" },
  ],
  film: [
    { type: "delivery_note", label: "ออกใบส่งของ" },
    { type: "receipt", label: "ออกใบเสร็จรับเงิน" },
  ],
};

/* ------------------------------- triggers ------------------------------- */

export function isNdbMenuTrigger(text: string): boolean {
  return /^(เมนู|เมนูหลัก|menu|ช่วยเหลือ|help|เริ่ม|start)$/i.test(String(text || "").trim());
}

export function isNdbHelpTrigger(text: string): boolean {
  return /^(วิธีใช้งาน|วิธีใช้|howto|how to)$/i.test(String(text || "").trim());
}

export function isNdbNewQuoteTrigger(text: string): boolean {
  return /^(สร้างใบเสนอราคา|ใบเสนอราคาใหม่|ขอใบเสนอราคา|new quote)$/i.test(String(text || "").trim());
}

export function isNdbTodayTrigger(text: string): boolean {
  return /^(เอกสารวันนี้|วันนี้|today)$/i.test(String(text || "").trim());
}

export function isNdbRecentTrigger(text: string): boolean {
  return /^(เอกสารล่าสุด|ล่าสุด|recent)$/i.test(String(text || "").trim());
}

export function parseNdbSearchTrigger(text: string): string | null {
  const m = String(text || "").trim().match(/^(?:ค้นหาเอกสาร|ค้นหา|search)\s*[:：]?\s*(.+)$/i);
  const q = m?.[1]?.trim();
  return q ? q : null;
}

/** ผู้ใช้ขอออกใบส่งของ/ใบเสร็จตรง ๆ (ต้องมีใบเสนอราคาที่อนุมัติก่อน) */
export function parseNdbDirectNextDoc(text: string): DocBotDocType | null {
  const t = String(text || "").split("\n")[0].trim();
  if (/^(?:ออก|ทำ|สร้าง)?\s*ใบส่ง(?:ของ|สินค้า)/.test(t)) return "delivery_note";
  if (/^(?:ออก|ทำ|สร้าง)?\s*ใบกำกับภาษี/.test(t)) return "tax_receipt";
  if (/^(?:ออก|ทำ|สร้าง)?\s*ใบเสร็จ(?:รับเงิน)?/.test(t)) return "receipt";
  return null;
}

export function isNdbDeleteAttempt(text: string): boolean {
  return /^(ลบเอกสาร|ลบใบ|ลบ)\s*/.test(String(text || "").trim());
}

/**
 * “รวมลิงก์ทั้งชุด” — ขอลิงก์ของเอกสารทุกฉบับในชุดเดียวกัน
 * รองรับระบุเลขที่เอกสารต่อท้าย เช่น “รวมลิงก์ทั้งชุด QT2026080002”
 * คืนค่า: null = ไม่ใช่คำสั่งนี้ / { docNo } = ระบุเลขที่ / { docNo: null } = ใช้ชุดล่าสุด
 */
export function parseNdbBundleTrigger(text: string): { docNo: string | null } | null {
  const t = String(text || "").trim();
  const m = t.match(/^(?:รวมลิงก์ทั้งชุด|รวมลิงก์|ลิงก์ทั้งชุด|bundle links?)\s*[:：]?\s*(.*)$/i);
  if (!m) return null;
  const no = (m[1] || "").trim();
  return { docNo: no ? no.split(/\s+/)[0] : null };
}

export const NDB_DELETE_BLOCKED =
  "ไม่สามารถลบเอกสารผ่าน LINE ได้ค่ะ หากต้องการยกเลิกเอกสาร กรุณาดำเนินการผ่านระบบแอดมิน";

/* ------------------------------- postback ------------------------------- */

export interface NdbPostback {
  action: string;
  shopKey?: NdbShopKey;
  draftId?: string;
  docNo?: string;
  docType?: string;
  token?: string;
}

export function buildNdbPostback(p: NdbPostback): string {
  const q = new URLSearchParams();
  q.set("a", p.action);
  if (p.shopKey) q.set("s", p.shopKey);
  if (p.draftId) q.set("d", p.draftId);
  if (p.docNo) q.set("n", p.docNo);
  if (p.docType) q.set("t", p.docType);
  if (p.token) q.set("k", p.token);
  return `ndb?${q.toString()}`;
}

export function parseNdbPostback(data: string): NdbPostback | null {
  const raw = String(data || "");
  if (!raw.startsWith("ndb?")) return null;
  const q = new URLSearchParams(raw.slice(4));
  const action = q.get("a");
  if (!action) return null;
  const s = q.get("s");
  return {
    action,
    shopKey: s === "colorlab" || s === "printing" || s === "film" ? s : undefined,
    draftId: q.get("d") ?? undefined,
    docNo: q.get("n") ?? undefined,
    docType: q.get("t") ?? undefined,
    token: q.get("k") ?? undefined,
  };
}

/** คีย์กันทำงานซ้ำ — ปุ่มเดิม/เหตุการณ์เดิมต้องได้ผลลัพธ์เดียว */
export function ndbActionKey(input: {
  groupId: string;
  lineUserId: string;
  action: string;
  ref?: string | null;
  eventId?: string | null;
}): string {
  return [
    "ndb",
    input.groupId,
    input.lineUserId,
    input.action,
    input.ref ?? "-",
    input.eventId ?? "-",
  ].join("|");
}

/* --------------------------------- flex --------------------------------- */

const money = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function btn(label: string, data: string, color: string, style: "primary" | "secondary" = "primary") {
  return {
    type: "button",
    style,
    height: "sm",
    color: style === "primary" ? color : undefined,
    action: { type: "postback", label, data, displayText: label },
  };
}

function uriBtn(label: string, uri: string, color: string, style: "primary" | "secondary" = "secondary") {
  return {
    type: "button",
    style,
    height: "sm",
    color: style === "primary" ? color : undefined,
    action: { type: "uri", label, uri },
  };
}

function header(shopKey: NdbShopKey, subtitle?: string) {
  const th = NDB_THEME[shopKey];
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: th.primary,
    paddingAll: "16px",
    contents: [
      { type: "text", text: NDB_TITLE, color: "#FFFFFF", weight: "bold", size: "lg" },
      { type: "text", text: subtitle ?? th.label, color: "#FFFFFF", size: "sm", margin: "xs", wrap: true },
    ],
  };
}

function bubble(shopKey: NdbShopKey, bodyContents: unknown[], footerContents: unknown[], subtitle?: string) {
  return {
    type: "bubble",
    header: header(shopKey, subtitle),
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFFFFF",
      spacing: "sm",
      paddingAll: "16px",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: footerContents,
    },
  };
}

export function buildNdbMenuFlex(
  shopKey: NdbShopKey,
  storeLabel?: string | null,
  appOrigin?: string | null,
): Record<string, unknown> {
  const th = NDB_THEME[shopKey];
  const pb = (action: string, label: string, style: "primary" | "secondary" = "primary") =>
    btn(label, buildNdbPostback({ action, shopKey }), th.primary, style);
  if (shopKey === "film") {
    const u = filmQueueUrls(appOrigin);
    return bubble(
      shopKey,
      [{ type: "text", text: NDB_INTRO_FILM, size: "sm", wrap: true, color: "#374151" }],
      [
        uriBtn("รับงานใหม่ (Q + เอกสาร)", u.intake, th.primary, "primary"),
        uriBtn("Q รันงาน", u.queue, th.primary, "secondary"),
        uriBtn("เอกสารทั้งหมด", u.docs, th.primary, "secondary"),
        pb("search", "ค้นหาเอกสาร", "secondary"),
        pb("menu", "เมนูหลัก", "secondary"),
      ],
      storeLabel || th.label,
    );
  }
  return bubble(
    shopKey,
    [{ type: "text", text: NDB_INTRO, size: "sm", wrap: true, color: "#374151" }],
    [
      pb("new_quote", "สร้างใบเสนอราคา"),
      pb("recent", "เอกสารล่าสุด", "secondary"),
      pb("search", "ค้นหาเอกสาร", "secondary"),
      pb("today", "เอกสารวันนี้", "secondary"),
      pb("help", "วิธีใช้งาน", "secondary"),
      pb("menu", "เมนูหลัก", "secondary"),
    ],
    storeLabel || th.label,
  );
}

export function buildNdbMissingFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  missing: string[];
  draftId?: string | null;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  return bubble(
    input.shopKey,
    [
      { type: "text", text: "ข้อมูลยังไม่ครบ", weight: "bold", size: "md", color: "#B45309" },
      {
        type: "text",
        text: "บอทไม่เดาข้อมูลแทนนะคะ กรุณาส่งเฉพาะข้อมูลที่ขาดต่อไปนี้",
        size: "xs",
        wrap: true,
        color: "#6B7280",
      },
      ...input.missing.map((m) => ({ type: "text", text: `• ${m}`, size: "sm", wrap: true, color: "#374151" })),
    ],
    [
      btn("ส่งข้อมูลเพิ่ม", buildNdbPostback({ action: "more_info", shopKey: input.shopKey, draftId: input.draftId ?? undefined }), th.primary),
      btn("ดูข้อมูลที่อ่านได้", buildNdbPostback({ action: "show_draft", shopKey: input.shopKey, draftId: input.draftId ?? undefined }), th.primary, "secondary"),
      btn("ยกเลิกร่าง", buildNdbPostback({ action: "cancel", shopKey: input.shopKey, draftId: input.draftId ?? undefined }), th.primary, "secondary"),
      btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary"),
    ],
    input.storeLabel,
  );
}

export function buildNdbDraftReviewFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  draftId: string;
  command: DocBotCommand;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const f = input.command.fields;
  const rows = f.items.slice(0, 8).map((it) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: `${it.description} x${it.quantity} ${it.unit ?? ""}`.trim(), size: "xs", wrap: true, flex: 5, color: "#374151" },
      { type: "text", text: money(it.total), size: "xs", align: "end", flex: 2, color: "#111827" },
    ],
  }));
  return bubble(
    input.shopKey,
    [
      { type: "text", text: "ตรวจสอบร่างใบเสนอราคา", weight: "bold", size: "md", color: "#111827" },
      {
        type: "text",
        text: "ยังไม่มีเลขเอกสาร และยังไม่ได้บันทึกเป็นเอกสารจริง",
        size: "xs",
        wrap: true,
        color: "#B45309",
      },
      { type: "separator", margin: "md" },
      { type: "text", text: `ลูกค้า: ${f.customerName ?? "-"}`, size: "sm", wrap: true, color: "#374151" },
      { type: "text", text: `โครงการ: ${f.project ?? "-"}`, size: "sm", wrap: true, color: "#374151" },
      ...rows,
      { type: "separator", margin: "md" },
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: "ยอดรวม", size: "sm", color: "#6B7280" },
          { type: "text", text: `${money(input.command.totals.total)} บาท`, size: "sm", align: "end", weight: "bold", color: "#111827" },
        ],
      },
      ...(f.notes ? [{ type: "text", text: `หมายเหตุ: ${f.notes}`, size: "xs", wrap: true, color: "#6B7280" }] : []),
    ],
    [
      btn("ยืนยันและสร้างใบเสนอราคา", buildNdbPostback({ action: "confirm", shopKey: input.shopKey, draftId: input.draftId }), th.primary),
      btn("ดูตัวอย่างเอกสาร", buildNdbPostback({ action: "preview", shopKey: input.shopKey, draftId: input.draftId }), th.primary, "secondary"),
      btn("แก้ไขข้อมูล", buildNdbPostback({ action: "edit", shopKey: input.shopKey, draftId: input.draftId }), th.primary, "secondary"),
      btn("ยกเลิกร่าง", buildNdbPostback({ action: "cancel", shopKey: input.shopKey, draftId: input.draftId }), th.primary, "secondary"),
      btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary"),
    ],
    input.storeLabel,
  );
}

/**
 * ปุ่ม “รวมลิงก์ทั้งชุด” จะโผล่เฉพาะเมื่อชุดเอกสารมีต้นชุด + ฉบับต่อเนื่องอย่างน้อย 1 ใบ
 * (bundleCount = จำนวนเอกสารทั้งชุด รวมต้นชุด)
 */
export function ndbShouldShowBundleButton(bundleCount?: number | null): boolean {
  return typeof bundleCount === "number" && Number.isFinite(bundleCount) && bundleCount >= 2;
}

export function buildNdbIssuedFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  docTypeLabel: string;
  docNo: string;
  customerName?: string | null;
  project?: string | null;
  total: number;
  actorLabel?: string | null;
  statusText?: string;
  docUrl?: string | null;
  pdfUrl?: string | null;
  approved?: boolean;
  /** จำนวนเอกสารในชุด (ต้นชุด + ต่อเนื่อง) — ใช้ตัดสินว่าจะโชว์ปุ่ม “รวมลิงก์ทั้งชุด” หรือไม่ */
  bundleCount?: number;
  /** origin ของร้านจริง (จาก webhook) — ใช้สร้างลิงก์ Q รันงานให้ตรงร้าน */
  appOrigin?: string | null;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const line = (text: string, first = false) => ({
    type: "text",
    text,
    size: "md",
    color: "#333333",
    wrap: true,
    margin: first ? "md" : "sm",
  });
  const okGreen = "#228B22";
  const footer: unknown[] = [];
  if (input.docUrl) footer.push(uriBtn("เปิดเอกสาร", input.docUrl, okGreen, "primary"));
  if (input.pdfUrl) footer.push(uriBtn("ดาวน์โหลด PDF", input.pdfUrl, okGreen));
  footer.push(btn("คัดลอกลิงก์", buildNdbPostback({ action: "copy_link", shopKey: input.shopKey, docNo: input.docNo }), th.primary, "secondary"));
  footer.push(btn("แก้ไขใบเสนอราคา", buildNdbPostback({ action: "revise", shopKey: input.shopKey, docNo: input.docNo }), th.primary, "secondary"));
  if (ndbShouldShowBundleButton(input.bundleCount)) {
    footer.push(btn("รวมลิงก์ทั้งชุด", buildNdbPostback({ action: "bundle", shopKey: input.shopKey, docNo: input.docNo }), th.primary, "secondary"));
  }
  if (!input.approved) {
    footer.push(btn("ลูกค้ายืนยันแล้ว", buildNdbPostback({ action: "approve_ask", shopKey: input.shopKey, docNo: input.docNo }), th.primary, "secondary"));
  }
  footer.push(btn("สร้างใบใหม่", buildNdbPostback({ action: "new_quote", shopKey: input.shopKey }), th.primary, "secondary"));
  if (input.shopKey === "film") {
    footer.push(uriBtn("Q รันงาน Film Shop", filmQueueUrls(input.appOrigin).queue, okGreen));
  }
  footer.push(btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary"));

  const details: unknown[] = [
    line(`ประเภท: ${input.docTypeLabel}`, true),
    line(`เลขที่เอกสาร: ${input.docNo}`),
    line(`ลูกค้า: ${input.customerName ?? "-"}`),
    ...(input.project ? [line(`โครงการ: ${input.project}`)] : []),
    {
      type: "text",
      text: `ยอดรวม: ${money(input.total)} บาท`,
      size: "md",
      color: "#333333",
      weight: "bold",
      wrap: true,
      margin: "sm",
    },
    line(`ผู้จัดทำ: ${input.actorLabel ?? "-"}`),
    line(`สถานะ: ${input.statusText ?? "รอลูกค้ายืนยัน"}`),
  ];
  const linkUrl = input.docUrl || input.pdfUrl;
  if (linkUrl) {
    details.push({
      type: "text",
      text: `ลิงก์: ${linkUrl}`,
      size: "xs",
      color: "#1E90FF",
      wrap: true,
      margin: "md",
    });
  }

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: okGreen,
      paddingAll: "lg",
      contents: [
        { type: "text", text: "สร้างเอกสารสำเร็จ", weight: "bold", size: "xl", color: "#ffffff" },
        {
          type: "text",
          text: input.storeLabel || th.label,
          size: "sm",
          color: "#ffffff",
          margin: "sm",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "lg",
      contents: [
        { type: "box", layout: "vertical", contents: details },
        { type: "separator", margin: "lg" },
        { type: "box", layout: "vertical", spacing: "sm", margin: "md", contents: footer },
      ],
    },
  };
}

export function buildNdbApproveConfirmFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  docNo: string;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  return bubble(
    input.shopKey,
    [
      {
        type: "text",
        text: `ยืนยันว่าลูกค้าอนุมัติใบเสนอราคาเลขที่ ${input.docNo} แล้วหรือไม่`,
        size: "sm",
        wrap: true,
        color: "#374151",
      },
    ],
    [
      btn("ยืนยัน ลูกค้าอนุมัติแล้ว", buildNdbPostback({ action: "approve_yes", shopKey: input.shopKey, docNo: input.docNo }), th.primary),
      btn("ยังไม่ยืนยัน", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary"),
    ],
    input.storeLabel,
  );
}

export function buildNdbApprovedFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  docNo: string;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const next = NDB_NEXT_DOCS[input.shopKey].map((n) =>
    btn(n.label, buildNdbPostback({ action: "next_doc", shopKey: input.shopKey, docNo: input.docNo, docType: String(n.type) }), th.primary),
  );
  return bubble(
    input.shopKey,
    [
      { type: "text", text: "บันทึกการอนุมัติแล้ว", weight: "bold", size: "md", color: "#15803D" },
      { type: "text", text: `ใบเสนอราคาเลขที่ ${input.docNo}`, size: "sm", color: "#374151", wrap: true },
      { type: "text", text: "เลือกเอกสารต่อเนื่องที่ต้องการออก", size: "xs", color: "#6B7280", wrap: true },
    ],
    [...next, btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary")],
    input.storeLabel,
  );
}

export function buildNdbQuotationRequiredFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  return bubble(
    input.shopKey,
    [{ type: "text", text: NDB_QUOTATION_REQUIRED, size: "sm", wrap: true, color: "#B91C1C" }],
    [
      btn("ค้นหาใบเสนอราคา", buildNdbPostback({ action: "search", shopKey: input.shopKey }), th.primary, "secondary"),
      btn("สร้างใบเสนอราคา", buildNdbPostback({ action: "new_quote", shopKey: input.shopKey }), th.primary),
      btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary"),
    ],
    input.storeLabel,
  );
}

export interface NdbDocRow {
  docNo: string;
  docTypeLabel: string;
  customerName?: string | null;
  total?: number | null;
  url?: string | null;
}

export function buildNdbDocListFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  title: string;
  rows: NdbDocRow[];
  emptyText?: string;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const body: unknown[] = [{ type: "text", text: input.title, weight: "bold", size: "md", color: "#111827" }];
  if (!input.rows.length) {
    body.push({ type: "text", text: input.emptyText ?? "ไม่พบเอกสารที่ตรงกัน", size: "sm", color: "#6B7280", wrap: true });
  } else {
    for (const r of input.rows.slice(0, 10)) {
      body.push({
        type: "box",
        layout: "vertical",
        margin: "md",
        contents: [
          { type: "text", text: `${r.docTypeLabel} ${r.docNo}`, size: "sm", weight: "bold", color: "#111827", wrap: true },
          {
            type: "text",
            text: `${r.customerName ?? "-"}${r.total != null ? ` · ${money(r.total)} บาท` : ""}`,
            size: "xs",
            color: "#6B7280",
            wrap: true,
          },
          ...(r.url ? [uriBtn("เปิดเอกสาร", r.url, th.primary)] : []),
        ],
      });
    }
  }
  return bubble(input.shopKey, body, [btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary")], input.storeLabel);
}

export interface NdbTodaySummary {
  quotations: number;
  approved: number;
  deliveries: number;
  receipts: number;
  /** ยอดขายนับเฉพาะใบเสร็จ/ใบกำกับภาษี — ห้ามนับใบเสนอราคาเป็นยอดขาย */
  receiptAmount: number;
}

export function buildNdbTodayFlex(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  summary: NdbTodaySummary;
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const s = input.summary;
  const row = (k: string, v: string) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, size: "sm", color: "#6B7280" },
      { type: "text", text: v, size: "sm", color: "#111827", align: "end" },
    ],
  });
  return bubble(
    input.shopKey,
    [
      { type: "text", text: "เอกสารวันนี้", weight: "bold", size: "md", color: "#111827" },
      row("ใบเสนอราคา", `${s.quotations} ใบ`),
      row("ยืนยันแล้ว", `${s.approved} ใบ`),
      row("ใบส่งของ", `${s.deliveries} ใบ`),
      row("ใบเสร็จ/ใบกำกับภาษี", `${s.receipts} ใบ`),
      { type: "separator", margin: "md" },
      row("ยอดจากใบเสร็จ", `${money(s.receiptAmount)} บาท`),
    ],
    [btn("เมนูหลัก", buildNdbPostback({ action: "menu", shopKey: input.shopKey }), th.primary, "secondary")],
    input.storeLabel,
  );
}

/* ---------------------- ชุดเอกสาร (รวมลิงก์ทั้งชุด) ---------------------- */

export interface NdbBundleItem {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  total?: number | null;
}

export interface NdbBundleDoc {
  docNo: string;
  docTypeLabel: string;
  customerName?: string | null;
  dateText?: string | null;
  total?: number | null;
  url?: string | null;
  pdfUrl?: string | null;
  items?: NdbBundleItem[];
  moreItems?: number;
  isSource?: boolean;
}

/** การ์ดเรียงชุด (carousel) — 1 ฉบับ = 1 การ์ด พร้อมตัวอย่างรายการในเอกสาร */
export function buildNdbBundleCarousel(input: {
  shopKey: NdbShopKey;
  storeLabel?: string | null;
  docs: NdbBundleDoc[];
}): Record<string, unknown> {
  const th = NDB_THEME[input.shopKey];
  const bubbles = input.docs.slice(0, 10).map((d) => {
    const itemLines = (d.items ?? []).slice(0, 4).map((it) => ({
      type: "text",
      text: `• ${it.description}${it.quantity != null ? ` × ${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : ""}${
        it.total != null ? ` — ${money(it.total)}` : ""
      }`,
      size: "xs",
      color: "#374151",
      wrap: true,
    }));
    if (d.moreItems && d.moreItems > 0) {
      itemLines.push({ type: "text", text: `และอีก ${d.moreItems} รายการ`, size: "xs", color: "#6B7280", wrap: true });
    }
    const footer: unknown[] = [];
    if (d.url) footer.push(uriBtn("เปิดเอกสาร", d.url, th.primary, "primary"));
    if (d.pdfUrl) footer.push(uriBtn("ดาวน์โหลด PDF", d.pdfUrl, th.primary));
    footer.push(btn("คัดลอกลิงก์", buildNdbPostback({ action: "copy_link", shopKey: input.shopKey, docNo: d.docNo }), th.primary, "secondary"));
    return bubble(
      input.shopKey,
      [
        { type: "text", text: `${d.docTypeLabel} ${d.docNo}`, weight: "bold", size: "md", color: "#111827", wrap: true },
        {
          type: "text",
          text: `${d.customerName ?? "-"}${d.dateText ? ` · ${d.dateText}` : ""}`,
          size: "xs",
          color: "#6B7280",
          wrap: true,
        },
        { type: "separator", margin: "sm" },
        ...(itemLines.length
          ? itemLines
          : [{ type: "text", text: "ไม่มีรายการในเอกสารนี้", size: "xs", color: "#6B7280", wrap: true }]),
        { type: "separator", margin: "sm" },
        {
          type: "text",
          text: `ยอดรวม: ${d.total != null ? `${money(d.total)} บาท` : "-"}`,
          size: "sm",
          weight: "bold",
          color: "#111827",
        },
      ],
      footer,
      d.isSource ? `${input.storeLabel || th.label} · ต้นชุด` : input.storeLabel || th.label,
    );
  });
  return { type: "carousel", contents: bubbles };
}

/** ข้อความรวมลิงก์ทุกฉบับในชุด — คัดลอกส่งต่อได้ทีเดียว */
export function buildNdbBundleLinksText(docs: NdbBundleDoc[], sourceDocNo?: string | null): string {
  if (!docs.length) return "ยังไม่พบเอกสารในชุดนี้ค่ะ";
  const lines = docs.map(
    (d, i) => `${i + 1}) ${d.docTypeLabel} ${d.docNo}${d.total != null ? ` — ${money(d.total)} บาท` : ""}\n${d.url ?? "-"}`,
  );
  return [
    `🔗 รวมลิงก์ทั้งชุด${sourceDocNo ? ` (อ้างอิง ${sourceDocNo})` : ""} — ${docs.length} ฉบับ`,
    "",
    ...lines,
  ].join("\n");
}

export const NDB_HELP_TEXT = [
  "วิธีใช้งาน NATTA DOC BOT",
  "",
  "1) ส่งข้อความ รูปภาพ หรือไฟล์ (PDF / Word / Excel) เข้ากลุ่มนี้",
  "2) บอทอ่านข้อมูลแล้วทำร่างใบเสนอราคาให้ตรวจสอบ (ยังไม่มีเลขเอกสาร)",
  "3) แก้ไขได้ด้วยภาษาธรรมชาติ เช่น “แก้จำนวนป้ายจาก 2 เป็น 3 ผืน”, “เปลี่ยนราคาผืนละ 800”, “เพิ่มหมายเหตุ ส่งงานวันที่ 20 สิงหาคม”",
  "4) กด “ยืนยันและสร้างใบเสนอราคา” ระบบจึงออกเลขที่จริง",
  "5) เมื่อลูกค้าอนุมัติ กด “ลูกค้ายืนยันแล้ว” จึงออกใบส่งของ/ใบเสร็จต่อได้",
  "",
  "บอทนี้ออกเอกสารเท่านั้น ไม่มีคิวงาน ไม่ตัดสต๊อก และไม่ส่งเอกสารให้ลูกค้าอัตโนมัติ",
].join("\n");

export function ndbFlexMessage(altText: string, contents: Record<string, unknown>) {
  return { type: "flex", altText, contents };
}

/* --------------------- ข้อความ/ไฟล์ที่บอทยังไม่รองรับ --------------------- */

/** ชนิดข้อความ LINE ที่บอทเอกสารรับไปทำงานต่อได้จริง */
export const NDB_SUPPORTED_MESSAGE_TYPES = ["text", "image", "file"] as const;

export function isNdbSupportedMessageType(t: string): boolean {
  return (NDB_SUPPORTED_MESSAGE_TYPES as readonly string[]).includes(String(t || ""));
}

const NDB_UNSUPPORTED_REASON: Record<string, string> = {
  sticker: "สติกเกอร์",
  audio: "ข้อความเสียง",
  video: "วิดีโอ",
  location: "ตำแหน่งที่ตั้ง",
  imagemap: "ภาพแบบ imagemap",
  template: "ข้อความเทมเพลต",
};

/**
 * ข้อความตอบกลับเมื่อผู้ส่งส่งสิ่งที่บอทเอกสารทำงานต่อไม่ได้
 * — บอกชัดว่ารับอะไรไม่ได้ ต้องทำอย่างไรต่อ และย้ำว่า “ไม่มีการออกเอกสารใด ๆ”
 */
export function ndbUnsupportedMessageText(messageType: string, detail?: string | null): string {
  const what = NDB_UNSUPPORTED_REASON[String(messageType || "")] ?? "ข้อความรูปแบบนี้";
  return [
    `⚠️ ${what} ยังใช้สั่งงานเอกสารไม่ได้ค่ะ`,
    detail ? detail : null,
    "",
    "วิธีที่ถูกต้อง:",
    "1) พิมพ์ข้อความ เช่น “ลูกค้า: โรงเรียนบ้านนา / ป้ายไวนิล 2 ผืน ผืนละ 800”",
    "2) หรือส่งไฟล์ PDF / รูปภาพ / Word (.docx) / Excel (XLSX, XLS) / CSV / TXT",
    "3) พิมพ์ “เมนู” เพื่อเปิดเมนูหลัก หรือ “ช่วยเหลือ” เพื่อดูวิธีใช้",
    "",
    "ยังไม่มีการสร้างร่างหรือออกเลขเอกสารจากข้อความนี้ค่ะ",
  ].filter((l) => l !== null).join("\n");
}

/** ข้อความตอบกลับเมื่อไฟล์ที่ส่งมาอ่านไม่ได้ (ชนิดไม่รองรับ) */
export function ndbUnsupportedFileText(detail: string): string {
  return [
    "⚠️ ไฟล์นี้บอทยังอ่านไม่ได้ค่ะ",
    detail,
    "",
    "ส่งใหม่เป็น PDF / รูปภาพ / Word (.docx) / Excel (XLSX, XLS) / CSV / TXT",
    "หรือพิมพ์รายการเป็นข้อความก็ได้ค่ะ",
    "",
    "ยังไม่มีการสร้างร่างหรือออกเลขเอกสารจากไฟล์นี้ค่ะ",
  ].join("\n");
}

/**
 * ข้อความยืนยันสั้น ๆ หลังออกเอกสารเสร็จ — ระบุชนิดเอกสาร เลขที่ และลิงก์ดาวน์โหลด
 * ใช้คู่กับการ์ด Flex เพื่อให้อ่านง่ายในแจ้งเตือนของ LINE
 */
export function buildNdbDoneSummaryText(input: {
  docTypeLabel: string;
  docNo: string;
  customerName?: string | null;
  total?: number | null;
  sourceDocNo?: string | null;
  docUrl?: string | null;
  pdfUrl?: string | null;
}): string {
  const lines = [
    `✅ สร้าง${input.docTypeLabel}เรียบร้อยแล้วค่ะ`,
    `เลขที่: ${input.docNo}`,
  ];
  if (input.customerName) lines.push(`ลูกค้า: ${input.customerName}`);
  if (input.total != null) lines.push(`ยอดรวม: ${money(Number(input.total))} บาท`);
  if (input.sourceDocNo) lines.push(`อ้างอิงใบเสนอราคา: ${input.sourceDocNo}`);
  if (input.pdfUrl) lines.push("", `📄 ดาวน์โหลด PDF: ${input.pdfUrl}`);
  if (input.docUrl) lines.push(`🔗 เปิดในระบบ: ${input.docUrl}`);
  if (!input.pdfUrl && !input.docUrl) lines.push("", "เปิดดูเอกสารได้จากเมนู “เอกสารล่าสุด” ค่ะ");
  return lines.join("\n");
}
