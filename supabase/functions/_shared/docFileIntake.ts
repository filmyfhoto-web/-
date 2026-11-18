/**
 * FILM SHOP — อ่านไฟล์แนบในห้อง LINE (รูปภาพ / PDF / Excel / CSV)
 * แล้วสกัดเป็น "รายการสินค้า + ข้อมูลลูกค้า" เพื่อใช้ออกเอกสารต่อ
 *
 * กติกาเดิมของระบบยังอยู่ครบ:
 *  - AI ใช้เพื่ออ่านข้อความในไฟล์เท่านั้น ยอดเงินคำนวณด้วยโค้ด (computeDraftTotals)
 *  - ไฟล์ที่อ่านได้จะถูกเก็บเป็น "ร่างจากไฟล์" (source = line_file) ผูกกับห้องแชต
 *    ยังไม่ออกเลขเอกสารจนกว่าจะมีคำสั่งออกเอกสารในห้องนั้น
 */
import { computeDraftTotals, type DraftItem } from "./docCommandParser.ts";
import { docxToText, isDocxFile, isLegacyDocFile, legacyDocMessage } from "./docText.ts";

export const DOC_FILE_MAX_BYTES = 10 * 1024 * 1024;

const SHEET_MIMES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export interface DocFilePayload {
  bytes: Uint8Array;
  mime: string;
  fileName: string;
}

export interface DocFileExtract {
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerTaxId?: string | null;
  project?: string | null;
  items: DraftItem[];
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function isSupportedDocFile(mime: string, fileName = ""): boolean {
  const m = String(mime || "").toLowerCase().split(";")[0];
  const name = String(fileName || "").toLowerCase();
  if (isLegacyDocFile(mime, fileName)) return false;
  return (
    m.startsWith("image/") ||
    m === "application/pdf" ||
    SHEET_MIMES.includes(m) ||
    m.startsWith("text/") ||
    isDocxFile(mime, fileName) ||
    /\.(xlsx|xls|csv|pdf|txt|md|docx)$/.test(name)
  );
}

/** ข้อความอธิบายเมื่อไฟล์อ่านไม่ได้ — แจ้งเป็นรายไฟล์ ไม่เดาข้อมูล */
export function unsupportedDocFileMessage(mime: string, fileName: string): string {
  if (isLegacyDocFile(mime, fileName)) return legacyDocMessage(fileName);
  return `ไฟล์ "${fileName}" ระบบยังอ่านไม่ได้ — รองรับ PDF, รูปภาพ, Word (.docx), Excel (XLSX/XLS), CSV, TXT`;
}

/** ดาวน์โหลดไฟล์ของข้อความ LINE (ทำฝั่งเซิร์ฟเวอร์เท่านั้น) */
export async function fetchLineFile(
  messageId: string,
  accessToken: string,
  fileName?: string | null,
): Promise<DocFilePayload> {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`line_content_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > DOC_FILE_MAX_BYTES) throw new Error("file_too_large");
  const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0];
  return { bytes: buf, mime, fileName: fileName || `line-${messageId}` };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Excel/CSV → ข้อความตาราง เพื่อส่งให้โมเดลอ่าน */
export async function sheetToText(file: DocFilePayload): Promise<string> {
  const name = file.fileName.toLowerCase();
  if (file.mime === "text/csv" || name.endsWith(".csv")) {
    return new TextDecoder().decode(file.bytes).slice(0, 20000);
  }
  // @ts-ignore -- Deno npm: specifier, resolved at runtime by the edge runtime
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(file.bytes, { type: "array" });
  return wb.SheetNames
    .map((s: string) => `# ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`)
    .join("\n\n")
    .slice(0, 20000);
}

const SYSTEM_PROMPT = [
  "คุณคือผู้ช่วยอ่านเอกสารรายการสินค้า/บริการของร้านพิมพ์และแล็ปภาพในประเทศไทย",
  "อ่านไฟล์ที่ได้รับแล้วตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น",
  'รูปแบบ: {"customerName":string|null,"customerPhone":string|null,"customerAddress":string|null,"customerTaxId":string|null,"project":string|null,"items":[{"description":string,"quantity":number,"unit":string,"unitPrice":number}]}',
  "unitPrice = ราคาต่อหน่วย (ถ้าไฟล์ให้มาเฉพาะยอดรวมของรายการ ให้หารด้วยจำนวน)",
  "ห้ามเดาข้อมูลที่ไม่มีในไฟล์ — ถ้าไม่มีให้เป็น null และห้ามสร้างรายการที่ไม่มีอยู่จริง",
].join("\n");

/** สกัดข้อมูลเอกสารจากไฟล์ด้วย Lovable AI (ยอดเงินคำนวณซ้ำด้วยโค้ดเสมอ) */
export async function extractDocFile(file: DocFilePayload, apiKey: string): Promise<DocFileExtract> {
  const name = file.fileName.toLowerCase();
  const isSheet = SHEET_MIMES.includes(file.mime) || /\.(xlsx|xls|csv)$/.test(name);
  const isPdf = file.mime === "application/pdf" || name.endsWith(".pdf");
  const isDocx = isDocxFile(file.mime, file.fileName);

  if (isLegacyDocFile(file.mime, file.fileName)) throw new Error(legacyDocMessage(file.fileName));

  let content: unknown[];
  if (isSheet) {
    content = [{ type: "text", text: `ตารางรายการจากไฟล์ ${file.fileName}:\n\n${await sheetToText(file)}` }];
  } else if (isDocx) {
    content = [
      { type: "text", text: `เนื้อหาจากไฟล์ Word ${file.fileName}:\n\n${await docxToText(file.bytes)}` },
    ];
  } else if (isPdf) {
    content = [
      { type: "text", text: "อ่านเอกสาร PDF นี้แล้วสรุปเป็น JSON ตามรูปแบบที่กำหนด" },
      {
        type: "file",
        file: { filename: file.fileName, file_data: `data:application/pdf;base64,${toBase64(file.bytes)}` },
      },
    ];
  } else {
    content = [
      { type: "text", text: "อ่านรูปเอกสารนี้แล้วสรุปเป็น JSON ตามรูปแบบที่กำหนด" },
      { type: "image_url", image_url: { url: `data:${file.mime};base64,${toBase64(file.bytes)}` } },
    ];
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai_${res.status}:${(await res.text()).slice(0, 200)}`);
  const raw = String((await res.json())?.choices?.[0]?.message?.content ?? "").trim();
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("ai_bad_json");
  }
  return normalizeExtract(parsed);
}

/** ทำความสะอาดผลจากโมเดล — ตัดรายการที่จำนวน/ราคาไม่สมเหตุผลทิ้ง */
export function normalizeExtract(parsed: Record<string, unknown>): DocFileExtract {
  const rawItems = Array.isArray(parsed?.items) ? (parsed.items as Record<string, unknown>[]) : [];
  const items: DraftItem[] = rawItems
    .map((it) => {
      const description = String(it?.description ?? "").trim();
      const quantity = Number(it?.quantity ?? 0);
      const unitPrice = Number(it?.unitPrice ?? 0);
      const unit = String(it?.unit ?? "").trim() || "ชิ้น";
      if (!description || !(quantity > 0) || !(unitPrice > 0)) return null;
      return {
        description,
        quantity,
        unit,
        unitPrice: money(unitPrice),
        discount: 0,
        total: money(quantity * unitPrice),
      } as DraftItem;
    })
    .filter((i): i is DraftItem => Boolean(i));

  const str = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s && s.toLowerCase() !== "null" ? s : null;
  };
  const taxDigits = String(parsed?.customerTaxId ?? "").replace(/[^\d]/g, "");
  return {
    customerName: str(parsed?.customerName),
    customerPhone: str(parsed?.customerPhone),
    customerAddress: str(parsed?.customerAddress),
    customerTaxId: taxDigits.length === 13 ? taxDigits : null,
    project: str(parsed?.project),
    items,
  };
}

/* ------------------------- ร่างจากไฟล์ ผูกกับห้องแชต ------------------------ */

export interface PendingFileDraft {
  id: string;
  extract: DocFileExtract;
  fileName: string;
}

/** บันทึกผลอ่านไฟล์เป็นร่าง (ยังไม่ออกเลข) ผูกกับห้องแชตที่ส่งไฟล์เข้ามา */
export async function savePendingFileDraft(
  admin: any,
  input: {
    messageId: string;
    roomId: string;
    lineUserId?: string | null;
    fileName: string;
    extract: DocFileExtract;
  },
): Promise<{ draftId: string; duplicate: boolean }> {
  const tempRef = `linefile:${input.messageId}`;
  const { data: existing } = await admin
    .from("document_command_drafts")
    .select("id")
    .eq("temp_ref", tempRef)
    .maybeSingle();
  if (existing) return { draftId: existing.id as string, duplicate: true };

  const totals = computeDraftTotals(input.extract.items, {});
  const { data, error } = await admin
    .from("document_command_drafts")
    .insert({
      temp_ref: tempRef,
      doc_type: "quotation",
      shop_key: "",
      customer_name: input.extract.customerName ?? null,
      customer_phone: input.extract.customerPhone ?? null,
      customer_address: input.extract.customerAddress ?? null,
      customer_tax_id: input.extract.customerTaxId ?? null,
      project: input.extract.project ?? null,
      subtotal: totals.subtotal,
      total: totals.total,
      missing_fields: ["ร้าน", "ประเภทเอกสาร"],
      status: "draft",
      source: "line_file",
      raw_command: `file:${input.fileName}`,
      parsed: {
        room_id: input.roomId,
        file_name: input.fileName,
        extract: input.extract,
      } as unknown as Record<string, unknown>,
      line_user_id: input.lineUserId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`file_draft_insert_failed: ${error?.message ?? "unknown"}`);

  await admin.from("document_command_audit").insert({
    draft_id: data.id,
    event: "line_file_parsed",
    detail: { file_name: input.fileName, items: input.extract.items.length },
    source: "line_file",
    line_user_id: input.lineUserId ?? null,
  });
  return { draftId: data.id as string, duplicate: false };
}

/**
 * ร่างจากไฟล์ล่าสุดที่ยังไม่ถูกใช้
 * ถ้าระบุ lineUserId จะจำกัดเฉพาะไฟล์ของผู้ส่งคนนั้น — กันไฟล์ของพนักงานคนอื่นในห้องเดียวกันปะปน
 */
export async function loadPendingFileDraft(
  admin: any,
  roomId: string,
  lineUserId?: string | null,
): Promise<PendingFileDraft | null> {
  let q = admin
    .from("document_command_drafts")
    .select("id, parsed, raw_command, line_user_id")
    .eq("source", "line_file")
    .eq("status", "draft")
    .filter("parsed->>room_id", "eq", roomId);
  if (lineUserId) q = q.eq("line_user_id", lineUserId);
  const { data: rows } = await q
    .order("created_at", { ascending: false })
    .limit(5);
  const data = (rows ?? []).find(
    (r: Record<string, unknown>) => !((r.parsed ?? {}) as Record<string, unknown>).consumed_at,
  );
  if (!data) return null;
  const parsed = (data.parsed ?? {}) as Record<string, unknown>;
  const extract = normalizeExtract((parsed.extract ?? {}) as Record<string, unknown>);
  if (!extract.items.length) return null;
  return { id: data.id as string, extract, fileName: String(parsed.file_name ?? "ไฟล์แนบ") };
}

/** ทำเครื่องหมายว่าร่างจากไฟล์ถูกใช้ออกเอกสารแล้ว */
export async function consumeFileDraft(admin: any, draftId: string, docNo: string): Promise<void> {
  const { data } = await admin
    .from("document_command_drafts")
    .select("parsed")
    .eq("id", draftId)
    .maybeSingle();
  const parsed = ((data?.parsed ?? {}) as Record<string, unknown>);
  await admin
    .from("document_command_drafts")
    .update({ parsed: { ...parsed, consumed_at: new Date().toISOString(), consumed_doc_no: docNo } })
    .eq("id", draftId);
}

/** เอกสารล่าสุดที่ออกจากห้องนี้ (ใช้ทำ “ใบส่งของจากเล่มเดิม” / “ใบเสร็จปิดยอด”) */
export async function loadLastIssuedDoc(
  admin: any,
  roomId: string,
): Promise<
  | {
      docNo: string;
      shopKey: string;
      customerName: string | null;
      customerPhone: string | null;
      customerAddress: string | null;
      customerTaxId: string | null;
      project: string | null;
      items: DraftItem[];
    }
  | null
> {
  const { data } = await admin
    .from("document_command_drafts")
    .select("id, final_doc_no, shop_key, customer_name, customer_phone, customer_address, customer_tax_id, project")
    .eq("status", "final")
    .filter("parsed->>room_id", "eq", roomId)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: rows } = await admin
    .from("document_command_items")
    .select("description, quantity, unit, unit_price, discount, total")
    .eq("draft_id", data.id)
    .order("sort_order", { ascending: true });
  const items: DraftItem[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    description: String(r.description ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? "ชิ้น"),
    unitPrice: Number(r.unit_price ?? 0),
    discount: Number(r.discount ?? 0),
    total: Number(r.total ?? 0),
  }));
  if (!items.length) return null;
  return {
    docNo: String(data.final_doc_no ?? ""),
    shopKey: String(data.shop_key ?? ""),
    customerName: (data.customer_name as string) ?? null,
    customerPhone: (data.customer_phone as string) ?? null,
    customerAddress: (data.customer_address as string) ?? null,
    customerTaxId: (data.customer_tax_id as string) ?? null,
    project: (data.project as string) ?? null,
    items,
  };
}
