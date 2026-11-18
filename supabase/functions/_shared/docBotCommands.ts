/**
 * FILM SHOP — คำสั่งบอทออกเอกสารในห้อง LINE ที่ผูกไว้แล้ว
 *
 *   ออกใบเสร็จ ร้านนัฐภรณ์ การพิมพ์
 *   ลูกค้า: คุณสมชาย ใจดี
 *   เบอร์: 0812345678
 *   ล้างฟิล์ม 2 ม้วน 150
 *   อัดรูป 4x6 20 ใบ 5
 *   ชำระแล้ว เงินสด
 *   ส่งลูกค้า U1234...        ← (ถ้าไม่ใส่ ระบบจะหาจากเบอร์โทรที่ผูก LINE ไว้)
 *
 * กติกา: ไม่เดาข้อมูลแทนผู้ใช้ — อะไรไม่ครบให้ตอบกลับถามเป็นภาษาไทย
 */
import {
  parseDocCommand,
  computeDraftTotals,
  DOC_TYPE_LABELS,
  SHOP_LABELS,
  type DraftFields,
  type DraftItem,
  type DraftTotals,
  type DocCommandType,
} from "./docCommandParser.ts";

export type DocBotDocType = Extract<
  DocCommandType,
  "receipt" | "tax_receipt" | "job_order" | "quotation" | "delivery_note"
>;

export type DocBotPriceType = "no_vat" | "include_vat" | "exclude_vat";

/** ค่าหัวเอกสารของฟอร์ม “ออกเอกสาร” ที่บอทเติมให้ได้ */
export interface DocBotDocOptions {
  /** สาขาของลูกค้า (ค่าเริ่มต้นในฟอร์มคือ “สำนักงานใหญ่”) */
  customerBranch?: string;
  /** A4 / A5 / 10x7 */
  paperSize?: string;
  /** เทมเพลตเอกสาร เช่น modern */
  template?: string;
  priceType?: DocBotPriceType;
  /** วันที่ออกเอกสาร YYYY-MM-DD */
  documentDate?: string;
  /** เอกสารที่ให้ออกพร้อมกัน (นอกเหนือจากเอกสารหลัก) */
  companions: DocBotDocType[];
}

export interface DocBotCommand {
  docType: DocBotDocType;
  fields: DraftFields;
  totals: DraftTotals;
  /** ปลายทางที่จะส่งภาพให้ลูกค้า */
  sendTo: { lineUserId?: string; phone?: string } | null;
  missing: string[];
  /** ค่าหัวเอกสาร/เอกสารพร้อมกัน — ใช้ตอนสร้างเอกสารจริง */
  doc: DocBotDocOptions;
}

const TRIGGER =
  /^(?:ออก|ทำ|สร้าง)\s*(ใบเสร็จ(?:รับเงิน)?|ใบกำกับภาษี|ใบเสร็จ\s*\/?\s*ใบกำกับภาษี|ใบเสนอราคา|ใบเสนอ|ใบส่งของ|ใบส่งสินค้า|ใบจัดจ้าง|ใบสั่งจ้าง|ใบสั่งงาน)/;

// บรรทัด "ข้อมูล" ไม่ใช่ "รายการ" — ต้องคัดออกก่อนเข้าตัวจับรายการ
// (ห้ามใช้ \b เพราะ \b ของ JS ไม่รู้จักอักษรไทย)
const SKIP_LINE = new RegExp(
  "^(?:(?:ออก|ทำ|สร้าง)\\s*ใบ" +
    "|(?:ชื่อลูกค้า|ลูกค้า|เบอร์โทร|เบอร์|โทร|ที่อยู่|เลขประจำตัวผู้เสียภาษี|เลขผู้เสียภาษี|หมายเหตุ|โครงการ|โปรเจกต์|วันนัดรับ|นัดรับ|กำหนด|ส่งให้ลูกค้า|ส่งลูกค้า|ส่งภาพ|send|ร้าน|ส่วนลด|มัดจำ|vat|ภาษีมูลค่าเพิ่ม|หัก\\s*ณ\\s*ที่จ่าย" +
    "|สาขา|กระดาษ|ขนาดกระดาษ|เทมเพลต|แม่แบบ|ประเภทราคา|ราคา\\s*แบบ|วันที่เอกสาร|วันที่ออก|ลงวันที่|พร้อม|ออกพร้อม|พร้อมกัน|แนบ)\\s*[:：=]?" +
    "|(?:ชำระแล้ว|จ่ายแล้ว|ชำระเงินแล้ว|ยังไม่ชำระ))",
  "i",
);

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * คำสั่งลัด `/jo ...` (ใบสั่งจ้าง) และ `/rc ...` (ใบเสร็จรับเงิน)
 * แปลงเป็นคำสั่งภาษาไทยเดิม เพื่อให้ parser/flow เดิมทำงานต่อได้ทั้งหมด
 *
 *   /jo โรงเรียน A | ปากกา 10 ด้าม | 5 บาท
 *   →  ออกใบสั่งจ้าง
 *      ลูกค้า: โรงเรียน A
 *      ปากกา 10 ด้าม 5
 */
const ALIAS_HEAD: Record<string, string> = {
  jo: "ออกใบสั่งจ้าง",
  rc: "ออกใบเสร็จ",
};

/** ราคาล้วน ๆ เช่น "5 บาท" / "5" — ต่อท้ายรายการก่อนหน้า */
const PRICE_ONLY = /^([\d,]+(?:\.\d+)?)\s*(?:บาท)?$/;

export function expandDocBotAlias(rawText: string): string {
  const text = String(rawText || "").replace(/\r/g, "");
  const m = text.match(/^\s*\/(jo|rc)\b[ \t]*([\s\S]*)$/i);
  if (!m) return text;
  const head = ALIAS_HEAD[m[1].toLowerCase()];
  const rest = (m[2] || "").trim();
  if (!rest) return head;

  const restLines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = restLines.shift() ?? "";
  const parts = first.split("|").map((p) => p.trim()).filter(Boolean);

  const out: string[] = [];
  // ส่วนแรกที่ไม่ใช่คำสั่งอื่น = ชื่อลูกค้า (เว้นแต่พิมพ์ "ลูกค้า:" มาเอง หรืออ้างอิงใบเสนอราคา)
  const body: string[] = [];
  parts.forEach((p, i) => {
    if (i === 0 && !/[:：]/.test(p) && !/(จาก|อ้างอิง|ตาม)\s/i.test(p) && !parseItemLine(p)) {
      body.push(`ลูกค้า: ${p}`);
      return;
    }
    const price = p.match(PRICE_ONLY);
    if (price && body.length) {
      body[body.length - 1] = `${body[body.length - 1]} ${price[1].replace(/,/g, "")}`;
      return;
    }
    body.push(p);
  });

  // บรรทัดแรกของคำสั่งลัดอาจมีการอ้างอิงใบเสนอราคา เช่น "/rc จาก QT-2026-0001"
  const firstIsRef = parts.length === 1 && /(จาก|อ้างอิง|ตาม|from|ref)/i.test(parts[0]);
  out.push(firstIsRef ? `${head} ${parts[0]}` : head);
  if (!firstIsRef) out.push(...body);
  out.push(...restLines);
  return out.join("\n");
}

/** บรรทัดรายการ: "<ชื่อรายการ> <จำนวน> [หน่วย] <ราคาต่อหน่วย>" */
export function parseItemLine(line: string): DraftItem | null {
  const t = line.trim().replace(/^[-•*]\s*/, "");
  if (!t || SKIP_LINE.test(t)) return null;
  const m = t.match(
    /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([ก-๙A-Za-z.]{0,8}?)\s*(?:[x×*@]|ละ|ราคา|@)?\s*([\d,]+(?:\.\d+)?)\s*(?:บาท)?$/,
  );
  if (!m) return null;
  const description = m[1].trim();
  const quantity = Number(String(m[2]).replace(/,/g, ""));
  const unitRaw = (m[3] || "").trim();
  const unitPrice = Number(String(m[4]).replace(/,/g, ""));
  if (!description || !(quantity > 0) || !(unitPrice > 0)) return null;
  const unit = unitRaw && !/^\d/.test(unitRaw) ? unitRaw : "ชิ้น";
  return { description, quantity, unit, unitPrice, discount: 0, total: money(quantity * unitPrice) };
}

/** ปลายทางที่จะส่งภาพให้ลูกค้า — รองรับ LINE userId หรือเบอร์โทร */
export function parseSendTarget(text: string): { lineUserId?: string; phone?: string } | null {
  const m = text.match(/(?:^|\n)\s*(?:ส่งลูกค้า|ส่งให้ลูกค้า|ส่งภาพ|send)\s*[:：]?\s*([^\n]*)/i);
  if (!m) return null;
  const raw = (m[1] || "").trim();
  const uid = raw.match(/\b(U[0-9a-f]{32})\b/i)?.[1];
  if (uid) return { lineUserId: uid };
  const phone = raw.replace(/[^\d]/g, "");
  if (phone.length >= 9) return { phone };
  return {}; // "ส่งลูกค้า" เปล่า ๆ = ใช้เบอร์จากในคำสั่ง
}

function docTypeOf(text: string): DocBotDocType | null {
  const m = text.match(TRIGGER);
  if (!m) return null;
  const w = m[1];
  if (/ใบกำกับภาษี/.test(w)) return "tax_receipt";
  if (/ใบเสร็จ/.test(w)) return "receipt";
  if (/ใบเสนอ/.test(w)) return "quotation";
  if (/ใบส่ง/.test(w)) return "delivery_note";
  return "job_order";
}

function docTypeOfWord(word: string): DocBotDocType | null {
  const w = word.trim();
  if (!w) return null;
  if (/ใบกำกับภาษี/.test(w)) return "tax_receipt";
  if (/ใบเสร็จ/.test(w)) return "receipt";
  if (/ใบเสนอ/.test(w)) return "quotation";
  if (/ใบส่ง/.test(w)) return "delivery_note";
  if (/ใบ(จัดจ้าง|สั่งจ้าง|สั่งงาน)/.test(w)) return "job_order";
  return null;
}

function isoDateFromThai(raw: string, now: Date): string | undefined {
  const m = raw.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const mon = Number(m[2]);
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
  if (!(day >= 1 && day <= 31) || !(mon >= 1 && mon <= 12)) return undefined;
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * อ่านค่าหัวเอกสารของฟอร์ม “ออกเอกสาร” จากคำสั่ง
 *   สาขา: สำนักงานใหญ่ · กระดาษ: A4 · เทมเพลต: modern
 *   ประเภทราคา: ราคาก่อน VAT · วันที่เอกสาร: 13/8
 *   พร้อม: ใบส่งของ, ใบเสร็จ
 */
export function parseDocOptions(text: string, now: Date = new Date()): DocBotDocOptions {
  const out: DocBotDocOptions = { companions: [] };
  for (const line of String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^สาขา\s*[:：]?\s*(.+)$/))) { out.customerBranch = m[1].trim(); continue; }
    if ((m = line.match(/^(?:ขนาด)?กระดาษ\s*[:：]?\s*(.+)$/))) {
      const v = m[1].trim().toUpperCase().replace(/\s+/g, "");
      out.paperSize = v === "A5" ? "A5" : v === "A4" ? "A4" : m[1].trim();
      continue;
    }
    if ((m = line.match(/^(?:เทมเพลต|แม่แบบ)\s*[:：]?\s*(.+)$/))) { out.template = m[1].trim(); continue; }
    if ((m = line.match(/^ประเภทราคา\s*[:：]?\s*(.+)$/))) {
      const v = m[1].trim();
      out.priceType = /รวม\s*vat/i.test(v) && !/ไม่รวม/.test(v)
        ? "include_vat"
        : /(ก่อน\s*vat|ไม่รวม\s*vat|แยก\s*vat)/i.test(v)
          ? "exclude_vat"
          : "no_vat";
      continue;
    }
    if ((m = line.match(/^(?:วันที่เอกสาร|วันที่ออก|ลงวันที่)\s*[:：]?\s*(.+)$/))) {
      const iso = isoDateFromThai(m[1].trim(), now);
      if (iso) out.documentDate = iso;
      continue;
    }
    if ((m = line.match(/^(?:พร้อม|ออกพร้อม|พร้อมกัน|แนบ)\s*[:：]?\s*(.+)$/))) {
      for (const part of m[1].split(/[,+/]|และ/)) {
        const t = docTypeOfWord(part);
        if (t && !out.companions.includes(t)) out.companions.push(t);
      }
      continue;
    }
  }
  return out;
}

/** สิ่งที่ยังขาดของคำสั่งบอท — ที่เดียวที่ตัดสินว่าออกเอกสารได้หรือยัง */
export function computeDocBotMissing(docType: DocBotDocType, fields: DraftFields): string[] {
  const missing: string[] = [];
  if (!fields.shopKey) missing.push("ร้าน (เช่น คัลเลอร์แล็ป / การพิมพ์ / FILM SHOP)");
  if (!fields.customerName?.trim()) missing.push("ชื่อลูกค้า (พิมพ์ “ลูกค้า: ชื่อ”)");
  if (!fields.items.length) missing.push("รายการ (เช่น “ล้างฟิล์ม 2 ม้วน 150”)");
  else if (fields.items.some((i) => !(i.quantity > 0) || !(i.unitPrice > 0) || !i.description.trim())) {
    missing.push("จำนวน/ราคาต่อหน่วยของรายการ");
  }
  if ((docType === "receipt" || docType === "tax_receipt") && fields.paymentStatus !== "paid") {
    missing.push("สถานะการชำระเงิน (พิมพ์ “ชำระแล้ว”)");
  }
  if (docType === "tax_receipt" && !fields.customerTaxId) missing.push("เลขผู้เสียภาษี 13 หลัก");
  return missing;
}

/**
 * เติมข้อมูลที่คำสั่งไม่ได้พิมพ์มา จากไฟล์แนบในห้อง หรือเอกสารใบก่อนหน้า
 * (เติมเฉพาะช่องที่ว่างเท่านั้น — สิ่งที่ผู้ใช้พิมพ์มาเองชนะเสมอ)
 */
export function applyDocBotCarryOver(
  command: DocBotCommand,
  source: {
    customerName?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    customerTaxId?: string | null;
    project?: string | null;
    shopKey?: string | null;
    items?: DraftItem[];
  },
): DocBotCommand {
  const f: DraftFields = { ...command.fields, items: [...command.fields.items] };
  const fill = (key: "customerName" | "customerPhone" | "customerAddress" | "customerTaxId" | "project") => {
    const v = source[key];
    if (!f[key] && v) f[key] = String(v);
  };
  (["customerName", "customerPhone", "customerAddress", "customerTaxId", "project"] as const).forEach(fill);
  if (!f.shopKey && (source.shopKey === "film" || source.shopKey === "colorlab" || source.shopKey === "printing")) {
    f.shopKey = source.shopKey;
  }
  if (!f.items.length && source.items?.length) f.items = source.items.map((i) => ({ ...i }));

  const missing = computeDocBotMissing(command.docType, f);
  f.missing = missing;
  return { ...command, fields: f, totals: computeDraftTotals(f.items, f), missing };
}

/**
 * แปลงข้อความในกลุ่มเป็นคำสั่งออกเอกสาร คืน null ถ้าไม่ใช่คำสั่งนี้
 */
export function parseDocBotCommand(rawText: string, now: Date = new Date()): DocBotCommand | null {
  // ผู้ใช้บางคนพิมพ์มาบรรทัดเดียวคั่นด้วย " / " → ถือว่าเท่ากับขึ้นบรรทัดใหม่
  // (ไม่แตะสแลชในวันที่ เช่น 1/8 เพราะต้องมีเว้นวรรคขนาบทั้งสองข้าง)
  const text = String(rawText || "")
    .replace(/\r/g, "")
    .replace(/^\s*\/(jo|rc)\b[\s\S]*$/i, (s) => expandDocBotAlias(s))
    .replace(/\s+\/\s+/g, "\n")
    .trim();
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const docType = docTypeOf(firstLine);
  if (!docType) return null;

  const fields = parseDocCommand(text, now);
  fields.docType = docType;

  // รายการหลายบรรทัดมีความสำคัญกว่าตัวจับรายการเดี่ยวของ parser กลาง
  const lineItems = text
    .split("\n")
    .slice(1)
    .map((l) => parseItemLine(l))
    .filter((i): i is DraftItem => Boolean(i));
  if (lineItems.length) fields.items = lineItems;

  // ใบจัดจ้าง/ใบเสนอราคา/ใบส่งของ จากบอทไม่บังคับวันนัดรับหรือการชำระเงิน
  const missing = computeDocBotMissing(docType, fields);
  fields.missing = missing;

  const totals = computeDraftTotals(fields.items, fields);
  const doc = parseDocOptions(text, now);
  doc.companions = doc.companions.filter((t) => t !== docType && t !== "job_order");
  if (!doc.priceType) {
    doc.priceType =
      fields.vatMode === "exclusive" ? "exclude_vat" : fields.vatMode === "inclusive" ? "include_vat" : "no_vat";
  }
  return { docType, fields, totals, sendTo: parseSendTarget(text), missing, doc };
}

export const DOC_BOT_HELP = [
  "🧾 คำสั่งออกเอกสารในห้องนี้",
  "",
  "ออกใบเสร็จ การพิมพ์",
  "ลูกค้า: คุณสมชาย",
  "เบอร์: 0812345678",
  "ล้างฟิล์ม 2 ม้วน 150",
  "ชำระแล้ว เงินสด",
  "ส่งลูกค้า 0812345678",
  "",
  "• เปลี่ยนบรรทัดแรกเป็น “ออกใบเสนอราคา” / “ออกใบส่งของ” / “ออกใบจัดจ้าง” ได้",
  "• คำสั่งลัด: “/jo โรงเรียน A | ปากกา 10 ด้าม | 5 บาท” = ใบสั่งจ้าง · “/rc จาก QT-2026-0001” = ใบเสร็จจากใบเสนอราคา",
  "• เติมหัวเอกสารได้ (ไม่ใส่ก็ได้): “สาขา: สำนักงานใหญ่” · “กระดาษ: A4” · “ประเภทราคา: ราคาก่อน VAT” · “วันที่เอกสาร: 13/8”",
  "• ออกหลายใบพร้อมกัน: “พร้อม: ใบส่งของ, ใบเสร็จ” — ระบบจะออกให้ครบและอ้างอิงถึงกัน",
  "• ส่งไฟล์ PDF / Excel / รูปรายการเข้าห้องนี้ก่อน แล้วพิมพ์เช่น “ออกใบเสนอราคา การพิมพ์ ลูกค้า: คุณสมชาย” ระบบจะดึงรายการจากไฟล์ให้",
  "• พิมพ์ “ออกใบส่งของ จากเล่มเดิม” เพื่อใช้ลูกค้า/รายการจากเอกสารใบล่าสุดของห้องนี้",
  "• ระบบจะออกเลขที่เอกสารจริง สร้างภาพ แล้วส่งให้ลูกค้าใน LINE",
].join("\n");

/** ถามเฉพาะสิ่งที่ขาด ไม่เดาข้อมูลแทนผู้ใช้ */
export function buildDocBotMissingText(docType: DocBotDocType, missing: string[]): string {
  return [
    `⚠️ ออก${DOC_TYPE_LABELS[docType]}ไม่ได้ ข้อมูลยังไม่ครบค่ะ`,
    ...missing.map((m) => `• ${m}`),
    "",
    "พิมพ์ “วิธีออกเอกสาร” เพื่อดูตัวอย่างคำสั่ง",
  ].join("\n");
}

const bahtText = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const DOC_BOT_BRAND = "#0F766E";

/* คำสั่ง “ออกเอกสาร” + การ์ดตัวช่วย ถูกถอดออกจากระบบตามคำขอเจ้าของร้าน */

/** คำเรียกร้านที่ใช้พิมพ์ในคำสั่ง */
export const SHOP_COMMAND_WORD: Record<"film" | "colorlab" | "printing", string> = {
  film: "FILM SHOP",
  colorlab: "คัลเลอร์แล็ป",
  printing: "การพิมพ์",
};

/** แม่แบบคำสั่งพร้อมก๊อปวาง แยกตามชนิดเอกสาร */
export const DOC_BOT_TEMPLATES: Record<DocBotDocType, string> = {
  receipt: [
    "ออกใบเสร็จ การพิมพ์",
    "ลูกค้า: คุณสมชาย",
    "เบอร์: 0812345678",
    "ปริ้นงาน A4 สี 10 แผ่น 10",
    "ชำระแล้ว เงินสด",
    "ส่งลูกค้า 0812345678",
  ].join("\n"),
  tax_receipt: [
    "ออกใบกำกับภาษี การพิมพ์",
    "ลูกค้า: บริษัท ตัวอย่าง จำกัด",
    "เลขผู้เสียภาษี: 0123456789012",
    "ที่อยู่: 1 ถ.ตัวอย่าง อ.เชียงกลาง จ.น่าน",
    "ปริ้นงาน A4 สี 10 แผ่น 10",
    "ชำระแล้ว โอน",
  ].join("\n"),
  quotation: [
    "ออกใบเสนอราคา คัลเลอร์แล็ป",
    "ลูกค้า: คุณสมชาย",
    "เบอร์: 0812345678",
    "อัดรูป 4x6 20 ใบ 5",
    "ส่งลูกค้า 0812345678",
  ].join("\n"),
  delivery_note: [
    "ออกใบส่งของ การพิมพ์",
    "ลูกค้า: คุณสมชาย",
    "ป้ายไวนิล 2 ผืน 450",
    "ส่งลูกค้า 0812345678",
  ].join("\n"),
  job_order: [
    "ออกใบจัดจ้าง การพิมพ์",
    "ลูกค้า: คุณสมชาย",
    "เบอร์: 0812345678",
    "ทำป้ายไวนิล 2 ผืน 450",
    "นัดรับ: พรุ่งนี้",
  ].join("\n"),
};

const TEMPLATE_REQUESTS: Array<[DocBotDocType, RegExp]> = [
  ["tax_receipt", /^(ตัวอย่าง)?\s*ใบกำกับภาษี$/],
  ["receipt", /^(ตัวอย่าง)?\s*ใบเสร็จ(รับเงิน)?$/],
  ["quotation", /^(ตัวอย่าง)?\s*ใบเสนอราคา$/],
  ["delivery_note", /^(ตัวอย่าง)?\s*ใบส่งของ$/],
  ["job_order", /^(ตัวอย่าง)?\s*ใบ(จัดจ้าง|สั่งจ้าง|สั่งงาน)$/],
];

/** "ตัวอย่างใบเสร็จ" → คืนแม่แบบคำสั่งของเอกสารนั้น */
export function parseDocTemplateRequest(text: string): DocBotDocType | null {
  const t = String(text || "").trim();
  for (const [docType, re] of TEMPLATE_REQUESTS) if (re.test(t)) return docType;
  return null;
}

export function buildDocTemplateText(
  docType: DocBotDocType,
  shopKey?: "film" | "colorlab" | "printing" | null,
  storeLabel?: string | null,
): string {
  let body = DOC_BOT_TEMPLATES[docType];
  if (shopKey) {
    const word = SHOP_COMMAND_WORD[shopKey];
    body = body
      .split("\n")
      .map((l, i) => (i === 0 ? l.replace(/\s+(การพิมพ์|คัลเลอร์แล็ป|FILM SHOP)$/, ` ${word}`) : l))
      .join("\n");
  }
  return [
    `🧾 ตัวอย่างคำสั่ง — ${DOC_TYPE_LABELS[docType]}`,
    shopKey ? `ร้านของห้องนี้: ${storeLabel || SHOP_LABELS[shopKey]}` : null,
    "ก๊อปข้อความด้านล่างไปแก้ชื่อ/รายการ แล้วส่งในห้องนี้ได้เลยค่ะ",
    "",
    body,
    "",
    shopKey
      ? "• ไม่ต้องเปลี่ยนชื่อร้าน ระบบใช้ร้านที่ผูกกับห้องนี้ให้อัตโนมัติ"
      : "• เปลี่ยนชื่อร้านเป็น “คัลเลอร์แล็ป” หรือ “การพิมพ์” ได้",
    "• อ้างอิงงานเดิมได้ เช่น “ออเดอร์ FY-0001” หรือ “ช่วงวันที่ 1/8 - 7/8”",
    "• ระบบจะแสดงตัวอย่างเอกสารให้ตรวจก่อน แล้วพิมพ์ “ยืนยัน” จึงออกเลขจริง",
  ].filter(Boolean).join("\n");
}


/** ปุ่มลัดใต้แป้นพิมพ์ */
export const DOC_BOT_QUICK_REPLY = {
  items: [
    { type: "action", action: { type: "message", label: "🧾 ใบเสร็จ", text: "ตัวอย่างใบเสร็จ" } },
    { type: "action", action: { type: "message", label: "💬 ใบเสนอราคา", text: "ตัวอย่างใบเสนอราคา" } },
    { type: "action", action: { type: "message", label: "📦 ใบส่งของ", text: "ตัวอย่างใบส่งของ" } },
    { type: "action", action: { type: "message", label: "🧮 ใบกำกับภาษี", text: "ตัวอย่างใบกำกับภาษี" } },
    { type: "action", action: { type: "message", label: "❓ วิธีออกเอกสาร", text: "วิธีออกเอกสาร" } },
  ],
};

/** การ์ดสรุปผลหลังออกเอกสาร (แสดงในกลุ่ม) */
export function buildDocIssuedFlex(input: {
  docType: DocBotDocType;
  docNo: string;
  shopKey: keyof typeof SHOP_LABELS;
  customerName: string;
  itemCount: number;
  amountDue: number;
  sentTo: string | null;
  imageUrl?: string | null;
  docsUrl: string;
  companionDocNos?: string[];
}): Record<string, unknown> {
  const rows: unknown[] = [
    { type: "text", text: `เลขที่ ${input.docNo}`, weight: "bold", size: "sm", wrap: true },
    ...(input.companionDocNos?.length
      ? [{
          type: "text",
          text: `ออกพร้อมกัน: ${input.companionDocNos.join(" · ")}`,
          size: "xxs",
          color: DOC_BOT_BRAND,
          wrap: true,
        }]
      : []),
    { type: "text", text: `ลูกค้า ${input.customerName}`, size: "xxs", color: "#666666", wrap: true },
    {
      type: "text",
      text: `${input.itemCount} รายการ · ${bahtText(input.amountDue)} บาท`,
      size: "xxs",
      color: "#666666",
    },
    {
      type: "text",
      text: input.sentTo ? `📤 ส่งภาพให้ลูกค้าแล้ว (${input.sentTo})` : "ℹ️ ยังไม่ได้ส่งภาพให้ลูกค้า",
      size: "xxs",
      color: input.sentTo ? DOC_BOT_BRAND : "#B45309",
      wrap: true,
    },
  ];
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: DOC_BOT_BRAND,
      paddingAll: "10px",
      contents: [
        { type: "text", text: `✅ ออก${DOC_TYPE_LABELS[input.docType]}แล้ว`, color: "#FFFFFF", weight: "bold", size: "sm", wrap: true },
        { type: "text", text: SHOP_LABELS[input.shopKey] ?? "", color: "#CCFBF1", size: "xxs", wrap: true },
      ],
    },
    ...(input.imageUrl
      ? {
          hero: {
            type: "image",
            url: input.imageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          },
        }
      : {}),
    body: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "10px", contents: rows },
    footer: {
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      paddingAll: "8px",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: DOC_BOT_BRAND,
          action: { type: "uri", label: "เปิดเอกสาร", uri: input.docsUrl },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: { type: "message", label: "วิธีออกเอกสาร", text: "วิธีออกเอกสาร" },
        },
      ],
    },
  };
}
