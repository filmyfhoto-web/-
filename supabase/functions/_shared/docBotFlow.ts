/**
 * FILM SHOP — โหมดพรีวิว/ยืนยัน + แก้ไขคำสั่ง + อ้างอิงออเดอร์ ของบอทเอกสาร
 * ฟังก์ชันทั้งหมดในไฟล์นี้เป็น pure function (ทดสอบได้) ส่วนการอ่านฐานข้อมูลอยู่ใน webhook
 */
import {
  computeDraftTotals,
  DOC_TYPE_LABELS,
  SHOP_LABELS,
  formatThaiDate,
  type DraftFields,
  type DraftItem,
  type ShopKey,
} from "./docCommandParser.ts";
import {
  computeDocBotMissing,
  parseItemLine,
  parseDocOptions,
  DOC_BOT_BRAND,
  type DocBotCommand,
  type DocBotDocType,
  type DocBotDocOptions,
} from "./docBotCommands.ts";

export const SHOP_KEY_BY_SLUG: Record<string, ShopKey> = {
  colorlab: "colorlab",
  printing: "printing",
  film: "film",
};

export function shopKeyFromSlug(slug?: string | null): ShopKey | null {
  const k = String(slug || "").trim().toLowerCase();
  return SHOP_KEY_BY_SLUG[k] ?? null;
}

const baht = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* ------------------------------------------------------------------ */
/* 1) อ้างอิงเลขที่ออเดอร์ / ช่วงวันที่                                  */
/* ------------------------------------------------------------------ */

export interface DocOrderRefs {
  orderNos: string[];
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

function toIsoDate(d: string, m: string, y: string | undefined, now: Date): string {
  const day = Number(d);
  const mon = Number(m);
  let year = y ? Number(y) : now.getFullYear();
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** จับ "ออเดอร์ FY-0001", "บิล 1234", "ช่วงวันที่ 1/8 - 7/8" */
export function parseDocOrderRefs(text: string, now: Date = new Date()): DocOrderRefs {
  const t = String(text || "");
  const orderNos: string[] = [];
  const re = /(?:ออเดอร์|เลขที่ออเดอร์|ออร์เดอร์|order|บิล|งานเลขที่)\s*[:：#]?\s*([A-Za-z0-9\-_/]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const no = m[1].trim();
    if (no && !orderNos.includes(no)) orderNos.push(no);
  }

  const range = t.match(
    /(?:ช่วงวันที่|ตั้งแต่วันที่|ระหว่างวันที่|ช่วง|วันที่)\s*(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\s*(?:-|–|ถึง|to)\s*(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/i,
  );
  if (range) {
    return {
      orderNos,
      from: toIsoDate(range[1], range[2], range[3], now),
      to: toIsoDate(range[4], range[5], range[6], now),
    };
  }
  return { orderNos };
}

export function hasDocOrderRefs(refs: DocOrderRefs): boolean {
  return refs.orderNos.length > 0 || Boolean(refs.from && refs.to);
}

/* ------------------------------------------------------------------ */
/* 1b) เลือกหลายออเดอร์จากช่วงวันที่เดียว                                */
/* ------------------------------------------------------------------ */

export interface DocOrderCandidate {
  orderNo: string;
  customerName: string | null;
  customerPhone: string | null;
  dateText: string;
  items: DraftItem[];
  total: number;
}

export interface DocOrderSelection {
  all: boolean;
  indexes: number[]; // 1-based
}

/** "เลือก 1,3", "เลือก 1-3", "ทั้งหมด", "เลือกทั้งหมด", "1 2 5" */
export function parseOrderSelection(text: string, count: number): DocOrderSelection | null {
  const t = String(text || "").trim();
  if (!t || count <= 0) return null;
  if (/^(?:เลือก\s*)?(?:ทั้งหมด|ทุกออเดอร์|all)$/i.test(t)) {
    return { all: true, indexes: Array.from({ length: count }, (_, i) => i + 1) };
  }
  const body = t.replace(/^(?:เลือก|เอา|ใช้)\s*/i, "").trim();
  if (!/^[\d\s,\-–]+$/.test(body)) return null;
  const picked: number[] = [];
  for (const part of body.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)[-–](\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) picked.push(i);
      continue;
    }
    if (/^\d+$/.test(part)) picked.push(Number(part));
    else return null;
  }
  const indexes = [...new Set(picked)].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  if (!indexes.length) return null;
  return { all: indexes.length === count, indexes };
}

/** รวมรายการจากออเดอร์ที่เลือก เป็นข้อมูลสำหรับเติมลงคำสั่งเอกสาร */
export function mergeSelectedOrders(
  candidates: DocOrderCandidate[],
  indexes: number[],
): { items: DraftItem[]; customerName: string | null; customerPhone: string | null; orderNos: string[] } | null {
  const picked = indexes.map((i) => candidates[i - 1]).filter(Boolean);
  if (!picked.length) return null;
  const items = picked.flatMap((c) => c.items.map((i) => ({ ...i })));
  if (!items.length) return null;
  return {
    items,
    customerName: picked.find((c) => c.customerName)?.customerName ?? null,
    customerPhone: picked.find((c) => c.customerPhone)?.customerPhone ?? null,
    orderNos: picked.map((c) => c.orderNo),
  };
}

export function buildOrderPickSummaryText(candidates: DocOrderCandidate[], indexes: number[]): string {
  const picked = indexes.map((i) => candidates[i - 1]).filter(Boolean);
  const total = picked.reduce((s, c) => s + (Number(c.total) || 0), 0);
  return [
    `เลือก ${picked.length} ออเดอร์: ${picked.map((c) => c.orderNo).join(", ")}`,
    `รวมทุกออเดอร์ ${baht(total)} บาท`,
  ].join("\n");
}

export const DOC_ORDER_PICK_QUICK_REPLY = {
  items: [
    { type: "action", action: { type: "message", label: "เลือกทั้งหมด", text: "เลือกทั้งหมด" } },
    { type: "action", action: { type: "message", label: "เลือก 1", text: "เลือก 1" } },
    { type: "action", action: { type: "message", label: "เลือก 1-3", text: "เลือก 1-3" } },
    { type: "action", action: { type: "message", label: "❌ ยกเลิก", text: "ยกเลิก" } },
  ],
};

/** การ์ดรายการออเดอร์ในช่วงวันที่ ให้เลือกก่อนออกเอกสาร */
export function buildOrderPickFlex(
  candidates: DocOrderCandidate[],
  docType: DocBotDocType,
  opts?: { storeLabel?: string | null; from?: string; to?: string },
): Record<string, unknown> {
  const shown = candidates.slice(0, 10);
  const grand = candidates.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const rows = shown.map((c, idx) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: `${idx + 1}.`, size: "xxs", color: "#666666", flex: 1 },
      {
        type: "box",
        layout: "vertical",
        flex: 6,
        contents: [
          { type: "text", text: c.orderNo, size: "xxs", weight: "bold", wrap: true },
          { type: "text", text: `${c.customerName || "-"} · ${c.dateText}`, size: "xxs", color: "#888888", wrap: true },
        ],
      },
      { type: "text", text: `${baht(c.total)}`, size: "xxs", flex: 3, align: "end" },
    ],
  }));
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: DOC_BOT_BRAND,
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: `🗂️ พบ ${candidates.length} ออเดอร์ในช่วงวันที่`,
          color: "#FFFFFF",
          weight: "bold",
          size: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: [opts?.storeLabel || "", opts?.from && opts?.to ? `${formatThaiDate(opts.from)} – ${formatThaiDate(opts.to)}` : ""]
            .filter(Boolean)
            .join(" · ") || DOC_TYPE_LABELS[docType],
          color: "#CCFBF1",
          size: "xxs",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "12px",
      contents: [
        ...rows,
        ...(candidates.length > shown.length
          ? [{ type: "text", text: `…และอีก ${candidates.length - shown.length} ออเดอร์`, size: "xxs", color: "#999999", wrap: true }]
          : []),
        { type: "separator", margin: "sm" },
        { type: "text", text: `รวมทั้งหมด ${baht(grand)} บาท`, size: "sm", weight: "bold", align: "end" },
        {
          type: "text",
          text: `จะออก${DOC_TYPE_LABELS[docType]} 1 ใบรวมออเดอร์ที่เลือก\nพิมพ์ “เลือก 1,3” หรือ “เลือก 1-3” หรือ “เลือกทั้งหมด” · “ยกเลิก” เพื่อทิ้ง`,
          size: "xxs",
          color: "#666666",
          wrap: true,
          margin: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: DOC_BOT_BRAND,
          action: { type: "message", label: "เลือกทั้งหมด", text: "เลือกทั้งหมด" },
        },
        { type: "button", style: "link", height: "sm", action: { type: "message", label: "ยกเลิก", text: "ยกเลิก" } },
      ],
    },
  };
}

/** ถามเลขที่ออเดอร์ / ช่วงวันที่ ก่อนออกเอกสาร */
export function buildAskOrderRefText(docType: DocBotDocType): string {
  return [
    `🧾 ออก${DOC_TYPE_LABELS[docType]} — ยังไม่มีรายการค่ะ`,
    "บอกที่มาของรายการได้เลย เลือกอย่างใดอย่างหนึ่ง:",
    "",
    "• เลขที่ออเดอร์ → พิมพ์ “ออเดอร์ FY-0001”",
    "• หลายออเดอร์ → พิมพ์ “ออเดอร์ FY-0001 ออเดอร์ FY-0002”",
    "• ช่วงวันที่ → พิมพ์ “ช่วงวันที่ 1/8 - 7/8” (ต้องมี “ลูกค้า: ชื่อ” ด้วย)",
    "  ถ้าเจอหลายออเดอร์ บอทจะให้เลือกก่อน เช่น “เลือก 1,3” หรือ “เลือกทั้งหมด”",
    "• พิมพ์รายการเอง → “ปริ้นงาน A4 10 แผ่น 10”",
    "",
    "ระบบจะดึงรายการมาให้ แล้วแสดงตัวอย่างเอกสารให้ยืนยันก่อนออกจริงค่ะ",
  ].join("\n");
}

export const DOC_ORDER_QUICK_REPLY = {
  items: [
    { type: "action", action: { type: "message", label: "✅ ยืนยันออกเอกสาร", text: "ยืนยัน" } },
    { type: "action", action: { type: "message", label: "✏️ แก้ไข", text: "แก้ ลูกค้า: " } },
    { type: "action", action: { type: "message", label: "❌ ยกเลิก", text: "ยกเลิก" } },
  ],
};

/* ------------------------------------------------------------------ */
/* 2) ยืนยัน / ยกเลิก                                                   */
/* ------------------------------------------------------------------ */

export function isDocConfirmText(text: string): boolean {
  return /^(ยืนยัน|ยืนยันออกเอกสาร|ออกเลย|ออกจริง|confirm|ok|โอเค)$/i.test(String(text || "").trim());
}

export function isDocCancelText(text: string): boolean {
  return /^(ยกเลิก|ยกเลิกเอกสาร|cancel|ไม่เอา)$/i.test(String(text || "").trim());
}

/* ------------------------------------------------------------------ */
/* 3) แก้ไขในคำตอบเดียว                                                 */
/* ------------------------------------------------------------------ */

export interface DocEditPatch {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
  project?: string;
  notes?: string;
  discount?: number;
  deposit?: number;
  paymentStatus?: "paid" | "unpaid" | "deposit";
  paymentMethod?: string;
  items?: DraftItem[];
  /** แก้จำนวนของรายการที่มีอยู่: [คำค้นชื่อรายการ, จำนวนใหม่] */
  quantityEdits?: Array<{ match: string; quantity: number }>;
  /** แก้ราคาต่อหน่วยของรายการที่มีอยู่ */
  priceEdits?: Array<{ match: string; unitPrice: number }>;
  /** ลบรายการที่ตรงกับคำค้น (หรือลำดับที่) */
  removeItems?: string[];
  /** เพิ่มรายการใหม่ต่อท้าย */
  addItems?: DraftItem[];
  /** แก้ค่าหัวเอกสาร เช่น สาขา/กระดาษ/วันที่เอกสาร/ออกพร้อมกัน */
  doc?: Partial<DocBotDocOptions>;
}

const num = (s: string) => Number(String(s).replace(/[, ]/g, ""));

/** บรรทัดที่ถือว่าเป็นคำสั่งแก้ไข แม้ไม่ได้ขึ้นต้นด้วย “แก้” */
const EDIT_PREFIX_RE =
  /^(ลูกค้า|ชื่อลูกค้า|เบอร์|โทร|ที่อยู่|เลข(?:ประจำตัว)?ผู้เสียภาษี|ส่วนลด|มัดจำ|หมายเหตุ|โครงการ|โปรเจกต์|สาขา|กระดาษ|ขนาดกระดาษ|เทมเพลต|แม่แบบ|ประเภทราคา|วันที่เอกสาร|วันที่ออก|ลงวันที่|พร้อม|ออกพร้อม|จำนวน|ราคา|ลบรายการ|ลบ|เพิ่มรายการ|เพิ่ม)\s*[:：]?\s*\S/;

/** "แก้ ลูกค้า: คุณเอ / ปริ้นงาน A4 20 แผ่น 10 / จำนวน ป้ายไวนิล 3" */
export function parseDocEditCommand(text: string, now: Date = new Date()): DocEditPatch | null {
  const raw = String(text || "").replace(/\r/g, "").trim();
  const stripped = raw.replace(/^(?:แก้ไข|แก้|เปลี่ยน|ปรับ)\s*/, "");
  if (stripped === raw && !EDIT_PREFIX_RE.test(raw)) {
    return null;
  }
  const lines = stripped.split(/\n|\s\/\s/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const patch: DocEditPatch = {};
  const items: DraftItem[] = [];
  for (const line of lines) {
    const l = line.replace(/^(?:แก้ไข|แก้|เปลี่ยน|ปรับ)\s*/, "");
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^(?:ลบรายการ|ลบ|เอาออก|ตัด)\s+(.+)$/))) {
      (patch.removeItems ??= []).push(m[1].trim());
      continue;
    }
    if ((m = l.match(/^(?:เพิ่มรายการ|เพิ่ม)\s+(.+)$/))) {
      const added = parseItemLine(m[1].trim());
      if (added) (patch.addItems ??= []).push(added);
      continue;
    }
    const opts = parseDocOptions(l, now);
    if (opts.customerBranch || opts.paperSize || opts.template || opts.priceType || opts.documentDate || opts.companions.length) {
      const doc = (patch.doc ??= {});
      if (opts.customerBranch) doc.customerBranch = opts.customerBranch;
      if (opts.paperSize) doc.paperSize = opts.paperSize;
      if (opts.template) doc.template = opts.template;
      if (opts.priceType) doc.priceType = opts.priceType;
      if (opts.documentDate) doc.documentDate = opts.documentDate;
      if (opts.companions.length) doc.companions = opts.companions;
      continue;
    }
    if ((m = l.match(/^(?:ชื่อลูกค้า|ลูกค้า)\s*[:：]?\s*(.+)$/))) { patch.customerName = m[1].trim(); continue; }
    if ((m = l.match(/^(?:เบอร์โทร|เบอร์|โทร)\s*[:：]?\s*([\d\-\s]+)$/))) { patch.customerPhone = m[1].replace(/[^\d]/g, ""); continue; }
    if ((m = l.match(/^(?:ที่อยู่)\s*[:：]?\s*(.+)$/))) { patch.customerAddress = m[1].trim(); continue; }
    if ((m = l.match(/^(?:เลข(?:ประจำตัว)?ผู้เสียภาษี|taxid|tax id)\s*[:：]?\s*([\d\s\-]{10,20})$/i))) {
      patch.customerTaxId = m[1].replace(/[^\d]/g, ""); continue;
    }
    if ((m = l.match(/^(?:โครงการ|โปรเจกต์)\s*[:：]?\s*(.+)$/))) { patch.project = m[1].trim(); continue; }
    if ((m = l.match(/^(?:หมายเหตุ)\s*[:：]?\s*(.+)$/))) { patch.notes = m[1].trim(); continue; }
    if ((m = l.match(/^(?:ส่วนลด)\s*[:：]?\s*([\d,\.]+)/))) { patch.discount = num(m[1]); continue; }
    if ((m = l.match(/^(?:มัดจำ)\s*[:：]?\s*([\d,\.]+)/))) { patch.deposit = num(m[1]); continue; }
    if (/^(ชำระแล้ว|จ่ายแล้ว|ชำระเงินแล้ว)/.test(l)) {
      patch.paymentStatus = "paid";
      if (/โอน/.test(l)) patch.paymentMethod = "โอนเงิน";
      else if (/เงินสด|สด/.test(l)) patch.paymentMethod = "เงินสด";
      continue;
    }
    if (/^ยังไม่ชำระ/.test(l)) { patch.paymentStatus = "unpaid"; continue; }
    if ((m = l.match(/^(?:จำนวน)\s+(.+?)\s+เป็น\s+([\d,\.]+)$/)) || (m = l.match(/^(?:จำนวน)\s+(.+?)\s+([\d,\.]+)$/))) {
      (patch.quantityEdits ??= []).push({ match: m[1].trim(), quantity: num(m[2]) });
      continue;
    }
    if ((m = l.match(/^(?:ราคา)\s+(.+?)\s+เป็น\s+([\d,\.]+)$/)) || (m = l.match(/^(?:ราคา)\s+(.+?)\s+([\d,\.]+)$/))) {
      (patch.priceEdits ??= []).push({ match: m[1].trim(), unitPrice: num(m[2]) });
      continue;
    }
    const item = parseItemLine(l);
    if (item) items.push(item);
  }
  if (items.length) patch.items = items;
  return Object.keys(patch).length ? patch : null;
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** ใช้ patch กับคำสั่งเดิม แล้วคำนวณยอดใหม่ทั้งหมด */
export function applyDocEditPatch(command: DocBotCommand, patch: DocEditPatch): DocBotCommand {
  const f: DraftFields = { ...command.fields, items: command.fields.items.map((i) => ({ ...i })) };
  if (patch.customerName) f.customerName = patch.customerName;
  if (patch.customerPhone) f.customerPhone = patch.customerPhone;
  if (patch.customerAddress) f.customerAddress = patch.customerAddress;
  if (patch.customerTaxId) f.customerTaxId = patch.customerTaxId;
  if (patch.project) f.project = patch.project;
  if (patch.notes) f.notes = patch.notes;
  if (patch.discount != null) f.discount = patch.discount;
  if (patch.deposit != null) f.deposit = patch.deposit;
  if (patch.paymentStatus) f.paymentStatus = patch.paymentStatus;
  if (patch.paymentMethod) f.paymentMethod = patch.paymentMethod;
  if (patch.items?.length) f.items = patch.items.map((i) => ({ ...i }));
  if (patch.addItems?.length) f.items = [...f.items, ...patch.addItems.map((i) => ({ ...i }))];
  if (patch.removeItems?.length) {
    for (const key of patch.removeItems) {
      const idx = /^\d+$/.test(key)
        ? Number(key) - 1
        : f.items.findIndex((it) => it.description.includes(key));
      if (idx >= 0 && idx < f.items.length) f.items.splice(idx, 1);
    }
  }

  const touch = (edits: Array<{ match: string }> | undefined, apply: (item: DraftItem, i: number) => void) => {
    if (!edits) return;
    edits.forEach((e, idx) => {
      const target =
        f.items.find((it) => it.description.includes(e.match)) ??
        (/^\d+$/.test(e.match) ? f.items[Number(e.match) - 1] : undefined) ??
        (f.items.length === 1 ? f.items[0] : undefined);
      if (target) apply(target, idx);
    });
  };
  touch(patch.quantityEdits, (item, i) => { item.quantity = patch.quantityEdits![i].quantity; });
  touch(patch.priceEdits, (item, i) => { item.unitPrice = patch.priceEdits![i].unitPrice; });
  f.items = f.items.map((i) => ({ ...i, total: money(i.quantity * i.unitPrice - (i.discount || 0)) }));

  const missing = computeDocBotMissing(command.docType, f);
  f.missing = missing;
  const doc: DocBotDocOptions = { ...command.doc, ...(patch.doc ?? {}) } as DocBotDocOptions;
  doc.companions = (patch.doc?.companions ?? command.doc?.companions ?? []).filter(
    (t) => t !== command.docType,
  );
  return { ...command, fields: f, totals: computeDraftTotals(f.items, f), missing, doc };
}

/** คู่มือคำสั่งแก้ไขหลังพรีวิว — พิมพ์ “แก้ไข” เพื่อดู */
export function isDocEditHelpText(text: string): boolean {
  return /^(แก้|แก้ไข|วิธีแก้|แก้ยังไง|edit)$/i.test(String(text || "").trim());
}

export const DOC_EDIT_HELP = [
  "✏️ แก้ร่างเอกสารก่อนยืนยัน — ก๊อปบรรทัดที่ต้องการไปแก้ค่าแล้วส่งได้เลยค่ะ",
  "",
  "แก้ ลูกค้า: คุณสมชาย",
  "แก้ เบอร์: 0812345678",
  "แก้ ที่อยู่: 1 ถ.ตัวอย่าง อ.เชียงกลาง จ.น่าน",
  "แก้ เลขผู้เสียภาษี: 0123456789012",
  "แก้ สาขา: สำนักงานใหญ่",
  "แก้ วันที่เอกสาร: 13/8",
  "แก้ กระดาษ: A5",
  "แก้ ประเภทราคา: ราคาก่อน VAT",
  "แก้ พร้อม: ใบส่งของ, ใบเสร็จ",
  "แก้ จำนวน ปริ้นงาน 20",
  "แก้ ราคา ปริ้นงาน 12",
  "แก้ ส่วนลด 100",
  "แก้ มัดจำ 500",
  "แก้ หมายเหตุ: ส่งของวันศุกร์",
  "เพิ่ม เคลือบมัน A4 50 แผ่น 3",
  "ลบรายการ ปริ้นงาน",
  "",
  "• ใส่หลายคำสั่งในข้อความเดียวได้ คั่นด้วย “ / ” หรือขึ้นบรรทัดใหม่",
  "• แก้เสร็จบอทจะโชว์ตัวอย่างใหม่ทุกครั้ง → พิมพ์ “ยืนยัน” เพื่อออกเลขจริง",
].join("\n");

/* ------------------------------------------------------------------ */
/* 4) การ์ดพรีวิวก่อนออกจริง                                             */
/* ------------------------------------------------------------------ */

const kv = (label: string, value: string) => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: label, size: "xxs", color: "#666666", flex: 4 },
    { type: "text", text: value, size: "xxs", wrap: true, flex: 6, align: "end" },
  ],
});

export function buildDocPreviewFlex(command: DocBotCommand, opts?: { storeLabel?: string | null }): Record<string, unknown> {
  const f = command.fields;
  const t = command.totals;
  const itemRows = f.items.slice(0, 8).map((i) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: i.description, size: "xxs", wrap: true, flex: 6 },
      { type: "text", text: `${i.quantity} ${i.unit} × ${baht(i.unitPrice)}`, size: "xxs", color: "#666666", flex: 4, align: "end" },
    ],
  }));
  if (f.items.length > 8) {
    itemRows.push({
      type: "box",
      layout: "horizontal",
      contents: [{ type: "text", text: `…และอีก ${f.items.length - 8} รายการ`, size: "xxs", color: "#999999", wrap: true, flex: 10 }],
    } as never);
  }
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: DOC_BOT_BRAND,
      paddingAll: "12px",
      contents: [
        { type: "text", text: `👀 ตัวอย่าง${DOC_TYPE_LABELS[command.docType]} (ยังไม่ออกเลขที่)`, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true },
        {
          type: "text",
          text: opts?.storeLabel || SHOP_LABELS[(f.shopKey ?? "film") as ShopKey],
          color: "#CCFBF1",
          size: "xxs",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "12px",
      contents: [
        kv("ลูกค้า", f.customerName ?? "-"),
        ...(f.customerPhone ? [kv("เบอร์", f.customerPhone)] : []),
        ...(f.customerTaxId ? [kv("เลขผู้เสียภาษี", f.customerTaxId)] : []),
        ...(command.doc?.customerBranch ? [kv("สาขา", command.doc.customerBranch)] : []),
        ...(command.doc?.documentDate ? [kv("วันที่เอกสาร", formatThaiDate(command.doc.documentDate))] : []),
        ...(command.doc?.paperSize && command.doc.paperSize !== "A4" ? [kv("กระดาษ", command.doc.paperSize)] : []),
        ...(command.doc?.companions?.length
          ? [kv("ออกพร้อมกัน", command.doc.companions.map((c) => DOC_TYPE_LABELS[c]).join(" · "))]
          : []),
        ...(f.dueAtISO ? [kv("นัดรับ", formatThaiDate(f.dueAtISO))] : []),
        { type: "separator", margin: "sm" },
        ...itemRows,
        { type: "separator", margin: "sm" },
        kv("รวมก่อนภาษี", baht(t.subtotal)),
        ...(t.discount ? [kv("ส่วนลด", `-${baht(t.discount)}`)] : []),
        ...(t.vatAmount ? [kv(`VAT ${f.vatRate}%`, baht(t.vatAmount))] : []),
        ...(t.whtAmount ? [kv(`หัก ณ ที่จ่าย ${f.whtRate}%`, `-${baht(t.whtAmount)}`)] : []),
        ...(f.deposit ? [kv("มัดจำ", `-${baht(f.deposit)}`)] : []),
        { type: "text", text: `ยอดสุทธิ ${baht(t.amountDue)} บาท`, weight: "bold", size: "sm", align: "end", margin: "sm" },
        {
          type: "text",
          text: "พิมพ์ “ยืนยัน” เพื่อออกเอกสารจริง · “แก้ ...” เพื่อแก้ไข · “ยกเลิก” เพื่อทิ้งร่าง",
          size: "xxs",
          color: "#666666",
          wrap: true,
          margin: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingAll: "10px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: DOC_BOT_BRAND,
          action: { type: "message", label: "✅ ยืนยันออกเอกสาร", text: "ยืนยัน" },
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "xs",
          contents: [
            { type: "button", style: "secondary", height: "sm", action: { type: "message", label: "✏️ แก้ไข", text: "แก้ ลูกค้า: " } },
            { type: "button", style: "link", height: "sm", action: { type: "message", label: "ยกเลิก", text: "ยกเลิก" } },
          ],
        },
      ],
    },
  };
}
