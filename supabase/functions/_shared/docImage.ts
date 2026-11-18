/**
 * FILM SHOP — เรนเดอร์ภาพเอกสาร (ใบเสร็จรับเงิน / ใบจัดจ้าง) เป็น PNG ฝั่งเซิร์ฟเวอร์
 *
 * ใช้กับบอท LINE: ออกเอกสารแล้วส่ง "ภาพ" ให้ลูกค้าในแชทได้ทันที
 * - วาดด้วย SVG แล้ว rasterize ด้วย resvg-wasm (ไม่ต้องใช้เบราว์เซอร์)
 * - ฟอนต์ไทย Sarabun โหลดครั้งเดียวต่อ instance แล้ว cache ไว้
 * - ตัวเลขทุกตัวรับมาจากผู้เรียก (คำนวณด้วย computeDraftTotals) ไม่คำนวณซ้ำที่นี่
 */
// @ts-ignore -- Deno npm: specifier, resolved at runtime by the edge runtime
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Regular.ttf",
  "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/sarabun/Sarabun-Bold.ttf",
];

let wasmReady: Promise<void> | null = null;
let fontsReady: Promise<Uint8Array[]> | null = null;

async function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const buf = await fetch(WASM_URL).then((r) => {
        if (!r.ok) throw new Error(`resvg_wasm_${r.status}`);
        return r.arrayBuffer();
      });
      await initWasm(new Uint8Array(buf));
    })().catch((e) => {
      wasmReady = null;
      throw e;
    });
  }
  return wasmReady;
}

async function ensureFonts(): Promise<Uint8Array[]> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONT_URLS.map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`font_${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    ).catch((e) => {
      fontsReady = null;
      throw e;
    });
  }
  return fontsReady;
}

export interface DocImageItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface DocImageInput {
  docTitle: string;
  docNo: string;
  shopName: string;
  issuedAtText: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  project?: string | null;
  dueText?: string | null;
  items: DocImageItem[];
  subtotal: number;
  discount: number;
  vatAmount: number;
  whtAmount: number;
  total: number;
  deposit: number;
  amountDue: number;
  paymentStatusText: string;
  paymentMethod?: string | null;
  notes?: string | null;
  footerNote?: string | null;
}

export const DOC_BRAND_COLOR = "#0F766E";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const baht = (n: number) =>
  (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** ตัดข้อความยาวให้พอดีความกว้างคอลัมน์ (ประมาณจากจำนวนตัวอักษร) */
function clip(text: string, max: number): string {
  const t = String(text ?? "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const W = 840;
const PAD = 40;

/** ประกอบ SVG ของเอกสาร — แยกออกมาเพื่อให้ทดสอบได้โดยไม่ต้องโหลด wasm */
export function buildDocSvg(input: DocImageInput): string {
  const items = input.items.slice(0, 12);
  const rowH = 34;
  const tableTop = 300;
  const tableH = 40 + items.length * rowH;
  const totalsTop = tableTop + tableH + 24;
  const totalRows = [
    ["รวมเป็นเงิน", input.subtotal],
    ...(input.discount > 0 ? [["ส่วนลด", -input.discount] as [string, number]] : []),
    ...(input.vatAmount > 0 ? [["ภาษีมูลค่าเพิ่ม 7%", input.vatAmount] as [string, number]] : []),
    ...(input.whtAmount > 0 ? [["หัก ณ ที่จ่าย", -input.whtAmount] as [string, number]] : []),
    ...(input.deposit > 0 ? [["หักมัดจำ", -input.deposit] as [string, number]] : []),
  ] as Array<[string, number]>;
  const totalsH = totalRows.length * 28 + 56;
  const notesTop = totalsTop + totalsH + 20;
  const H = notesTop + (input.notes ? 60 : 20) + 60;

  const t = (
    x: number,
    y: number,
    text: string,
    opts: { size?: number; color?: string; bold?: boolean; anchor?: string } = {},
  ) =>
    `<text x="${x}" y="${y}" font-family="Sarabun" font-size="${opts.size ?? 16}" fill="${
      opts.color ?? "#111827"
    }"${opts.bold ? ' font-weight="700"' : ""}${
      opts.anchor ? ` text-anchor="${opts.anchor}"` : ""
    }>${esc(text)}</text>`;

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);
  // header
  parts.push(`<rect x="0" y="0" width="${W}" height="120" fill="${DOC_BRAND_COLOR}"/>`);
  parts.push(t(PAD, 52, input.shopName, { size: 24, color: "#FFFFFF", bold: true }));
  parts.push(t(PAD, 86, input.docTitle, { size: 18, color: "#CCFBF1" }));
  parts.push(t(W - PAD, 52, `เลขที่ ${input.docNo}`, { size: 18, color: "#FFFFFF", bold: true, anchor: "end" }));
  parts.push(t(W - PAD, 86, `วันที่ ${input.issuedAtText}`, { size: 14, color: "#CCFBF1", anchor: "end" }));

  // customer block
  parts.push(`<rect x="${PAD}" y="150" width="${W - PAD * 2}" height="120" fill="#F0FDFA" rx="10"/>`);
  parts.push(t(PAD + 18, 180, "ลูกค้า", { size: 13, color: "#0F766E", bold: true }));
  parts.push(t(PAD + 18, 206, clip(input.customerName, 40), { size: 18, bold: true }));
  const infoLines = [
    input.customerPhone ? `โทร ${input.customerPhone}` : "",
    input.customerAddress ? clip(input.customerAddress, 58) : "",
    input.project ? `งาน: ${clip(input.project, 44)}` : "",
    input.dueText ? `กำหนดส่ง: ${input.dueText}` : "",
  ].filter(Boolean);
  infoLines.slice(0, 2).forEach((line, i) => {
    parts.push(t(PAD + 18, 232 + i * 22, line, { size: 14, color: "#374151" }));
  });
  parts.push(
    t(W - PAD - 18, 206, input.paymentStatusText, { size: 16, color: DOC_BRAND_COLOR, bold: true, anchor: "end" }),
  );
  if (input.paymentMethod) {
    parts.push(t(W - PAD - 18, 230, `ชำระโดย ${input.paymentMethod}`, { size: 14, color: "#374151", anchor: "end" }));
  }

  // table
  const cx = { desc: PAD + 16, qty: 470, price: 590, total: W - PAD - 16 };
  parts.push(`<rect x="${PAD}" y="${tableTop}" width="${W - PAD * 2}" height="40" fill="#134E4A" rx="8"/>`);
  parts.push(t(cx.desc, tableTop + 26, "รายการ", { size: 14, color: "#FFFFFF", bold: true }));
  parts.push(t(cx.qty, tableTop + 26, "จำนวน", { size: 14, color: "#FFFFFF", bold: true, anchor: "end" }));
  parts.push(t(cx.price, tableTop + 26, "ราคา/หน่วย", { size: 14, color: "#FFFFFF", bold: true, anchor: "end" }));
  parts.push(t(cx.total, tableTop + 26, "จำนวนเงิน", { size: 14, color: "#FFFFFF", bold: true, anchor: "end" }));
  items.forEach((it, i) => {
    const y = tableTop + 40 + i * rowH;
    if (i % 2 === 1) {
      parts.push(`<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${rowH}" fill="#F9FAFB"/>`);
    }
    parts.push(t(cx.desc, y + 23, `${i + 1}. ${clip(it.description, 36)}`, { size: 15 }));
    parts.push(t(cx.qty, y + 23, `${it.quantity} ${it.unit}`, { size: 15, anchor: "end" }));
    parts.push(t(cx.price, y + 23, baht(it.unitPrice), { size: 15, anchor: "end" }));
    parts.push(t(cx.total, y + 23, baht(it.total), { size: 15, anchor: "end" }));
  });
  parts.push(
    `<rect x="${PAD}" y="${tableTop}" width="${W - PAD * 2}" height="${tableH}" fill="none" stroke="#E5E7EB" rx="8"/>`,
  );

  // totals
  totalRows.forEach(([label, value], i) => {
    const y = totalsTop + 20 + i * 28;
    parts.push(t(W - PAD - 190, y, label, { size: 15, color: "#374151", anchor: "end" }));
    parts.push(t(W - PAD - 16, y, baht(value), { size: 15, anchor: "end" }));
  });
  const grandY = totalsTop + 20 + totalRows.length * 28 + 16;
  parts.push(
    `<rect x="${W - PAD - 380}" y="${grandY - 26}" width="${364}" height="44" fill="${DOC_BRAND_COLOR}" rx="8"/>`,
  );
  parts.push(t(W - PAD - 200, grandY + 3, "ยอดสุทธิ", { size: 16, color: "#FFFFFF", bold: true, anchor: "end" }));
  parts.push(
    t(W - PAD - 28, grandY + 3, `${baht(input.amountDue)} บาท`, {
      size: 18,
      color: "#FFFFFF",
      bold: true,
      anchor: "end",
    }),
  );

  if (input.notes) {
    parts.push(t(PAD, notesTop + 10, `หมายเหตุ: ${clip(input.notes, 70)}`, { size: 14, color: "#374151" }));
  }
  parts.push(
    t(PAD, H - 24, input.footerNote ?? "เอกสารนี้ออกโดยระบบ FILM SHOP ผ่าน LINE OA", {
      size: 12,
      color: "#9CA3AF",
    }),
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
}

/** เรนเดอร์เอกสารเป็น PNG (ไบต์) */
export async function renderDocPng(input: DocImageInput): Promise<Uint8Array> {
  const [, fonts] = await Promise.all([ensureWasm(), ensureFonts()]);
  const resvg = new Resvg(buildDocSvg(input), {
    font: { fontBuffers: fonts, defaultFontFamily: "Sarabun", loadSystemFonts: false },
    fitTo: { mode: "width", value: W },
  });
  return resvg.render().asPng();
}

/** เรนเดอร์เอกสารเป็นพิกเซลดิบ (RGBA) — ใช้ต่อเป็นไฟล์ PDF */
export async function renderDocRgba(
  input: DocImageInput,
  scale = 2,
): Promise<{ width: number; height: number; pixels: Uint8Array }> {
  const [, fonts] = await Promise.all([ensureWasm(), ensureFonts()]);
  const resvg = new Resvg(buildDocSvg(input), {
    font: { fontBuffers: fonts, defaultFontFamily: "Sarabun", loadSystemFonts: false },
    fitTo: { mode: "width", value: W * scale },
  });
  const rendered = resvg.render();
  return {
    width: rendered.width,
    height: rendered.height,
    pixels: new Uint8Array(rendered.pixels),
  };
}

/** อัปโหลดภาพเอกสารแล้วคืน signed URL ที่ LINE ดึงไปแสดงได้ */
export async function uploadDocImage(
  admin: any,
  docNo: string,
  png: Uint8Array,
  expiresInSeconds = 60 * 60 * 24 * 30,
): Promise<{ path: string; url: string }> {
  const path = `${new Date().getUTCFullYear()}/${docNo}-${Date.now()}.png`;
  const up = await admin.storage.from("doc-images").upload(path, png, {
    contentType: "image/png",
    upsert: true,
  });
  if (up.error) throw new Error(`doc_image_upload_failed: ${up.error.message}`);
  const signed = await admin.storage.from("doc-images").createSignedUrl(path, expiresInSeconds);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`doc_image_sign_failed: ${signed.error?.message ?? "no url"}`);
  }
  return { path, url: signed.data.signedUrl };
}
