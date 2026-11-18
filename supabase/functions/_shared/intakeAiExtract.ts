/**
 * อ่านไฟล์แนบในกลุ่ม LINE ด้วย AI (Lovable AI Gateway) → ข้อมูล "รับงานใหม่"
 *
 * กติกา:
 *  - ใช้เฉพาะไฟล์ภาพ (JPG/PNG/HEIC/HEIF) และ PDF ที่ตรวจ MIME/ขนาดฝั่งเซิร์ฟเวอร์แล้ว
 *  - ห้ามเดา: ค่าที่ไม่มีในไฟล์ต้องเป็น null
 *  - เก็บ confidence ต่อฟิลด์ เพื่อให้การ์ดแจ้ง “มีข้อมูลให้ตรวจ N จุด”
 *  - ไม่ log เนื้อไฟล์/โทเคนใด ๆ
 */
export const INTAKE_AI_MAX_BYTES = 10 * 1024 * 1024;

export type IntakeFieldKey =
  | "customerName" | "customerNameEn" | "contactName"
  | "phone" | "taxId" | "address" | "dueAt" | "note";

export interface ExtractedField { value: string; confidence: number }
export interface ExtractedItem { title: string; quantity: number | null; unit: string; confidence: number }
export interface ExtractedIntake {
  sourceName: string;
  fields: Partial<Record<IntakeFieldKey, ExtractedField>>;
  items: ExtractedItem[];
  mode: "preview" | "local" | "live";
}

const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"];
const GENERIC_MIMES = ["", "application/octet-stream", "binary/octet-stream"];

/**
 * ตรวจชนิดไฟล์ฝั่งเซิร์ฟเวอร์ — MIME คือความจริงหลัก
 * อนุญาตจากนามสกุลได้เฉพาะเมื่อ MIME ว่างหรือเป็น generic octet-stream เท่านั้น
 */
export function isIntakeAiFile(mime: string, fileName = ""): boolean {
  const m = String(mime || "").toLowerCase().split(";")[0];
  const n = String(fileName || "").toLowerCase();
  if (IMAGE_MIMES.includes(m) || m === "application/pdf") return true;
  if (!GENERIC_MIMES.includes(m)) return false;
  return /\.(jpe?g|png|heic|heif|pdf)$/.test(n);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

const SYSTEM_PROMPT = [
  "คุณคือผู้ช่วยอ่านใบสั่งงาน/นามบัตร/ใบเสนอราคาของร้านพิมพ์ในประเทศไทย",
  "อ่านไฟล์แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น",
  'รูปแบบ: {"customerName":{"value":string,"confidence":number}|null, "customerNameEn":...|null, "contactName":...|null, "phone":...|null, "taxId":...|null, "address":...|null, "dueAt":...|null, "note":...|null, "items":[{"title":string,"quantity":number|null,"unit":string,"confidence":number}]}',
  "confidence = 0–1 ตามความชัดของข้อมูลในไฟล์",
  "ห้ามเดาเด็ดขาด — ถ้าไม่มีข้อมูลนั้นในไฟล์ให้เป็น null และห้ามสร้างรายการงานที่ไม่มีจริง",
].join("\n");

const clean = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s && s.toLowerCase() !== "null" ? s : "";
};

/** แปลงผลดิบจากโมเดลให้อยู่ในรูป ExtractedIntake (normalize เลขภาษี 13 หลัก) */
export function normalizeIntakeExtract(parsed: Record<string, unknown>, sourceName: string): ExtractedIntake {
  const fields: Partial<Record<IntakeFieldKey, ExtractedField>> = {};
  const keys: IntakeFieldKey[] = [
    "customerName", "customerNameEn", "contactName", "phone", "taxId", "address", "dueAt", "note",
  ];
  for (const k of keys) {
    const raw = parsed?.[k] as Record<string, unknown> | string | null | undefined;
    const value = clean(typeof raw === "object" && raw ? raw.value : raw);
    if (!value) continue;
    let final = value;
    if (k === "taxId") {
      const digits = value.replace(/\D+/g, "");
      if (digits.length !== 13) continue;
      final = digits;
    }
    const conf = Number((typeof raw === "object" && raw ? raw.confidence : 0.8) ?? 0.8);
    fields[k] = { value: final, confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.8 };
  }

  const rawItems = Array.isArray(parsed?.items) ? (parsed.items as Record<string, unknown>[]) : [];
  const items: ExtractedItem[] = rawItems
    .map((it) => {
      const title = clean(it?.title ?? it?.description);
      if (!title) return null;
      const qtyRaw = Number(it?.quantity ?? NaN);
      const conf = Number(it?.confidence ?? 0.8);
      return {
        title,
        quantity: Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : null,
        unit: clean(it?.unit) || "ชิ้น",
        confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.8,
      } as ExtractedItem;
    })
    .filter((i): i is ExtractedItem => Boolean(i))
    .slice(0, 20);

  return { sourceName, fields, items, mode: "live" };
}

/** เรียก AI จริงเพื่ออ่านไฟล์ — โยน Error เมื่ออ่านไม่ได้ (ผู้เรียกต้องตอบปุ่มกรอกเอง) */
export async function extractIntakeFromLineFile(
  file: { bytes: Uint8Array; mime: string; fileName: string },
  apiKey: string,
): Promise<ExtractedIntake> {
  if (!apiKey) throw new Error("ai_key_missing");
  if (file.bytes.byteLength > INTAKE_AI_MAX_BYTES) throw new Error("file_too_large");
  if (!isIntakeAiFile(file.mime, file.fileName)) throw new Error("unsupported_type");

  const isPdf = file.mime === "application/pdf" || /\.pdf$/i.test(file.fileName);
  const content = isPdf
    ? [
        { type: "text", text: "อ่านเอกสาร PDF นี้แล้วสรุปเป็น JSON ตามรูปแบบที่กำหนด" },
        {
          type: "file",
          file: { filename: file.fileName, file_data: `data:application/pdf;base64,${toBase64(file.bytes)}` },
        },
      ]
    : [
        { type: "text", text: "อ่านรูปนี้แล้วสรุปเป็น JSON ตามรูปแบบที่กำหนด" },
        { type: "image_url", image_url: { url: `data:${file.mime};base64,${toBase64(file.bytes)}` } },
      ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`ai_${res.status}`);
  const raw = String((await res.json())?.choices?.[0]?.message?.content ?? "").trim();
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonText); } catch { throw new Error("ai_bad_json"); }
  return normalizeIntakeExtract(parsed, file.fileName);
}

export const NOT_SPECIFIED_TEXT = "ยังไม่ได้ระบุ";
export const LOW_CONFIDENCE = 0.8;

/** สรุป 4 บรรทัดสำหรับการ์ดใบเดียว + จำนวนจุดที่ต้องตรวจ */
export function buildIntakeCardSummary(r: ExtractedIntake) {
  const val = (k: IntakeFieldKey) => r.fields[k]?.value?.trim() || "";
  const items = r.items.map((i) => i.title).filter(Boolean).join(", ");
  const raw = [
    { label: "ลูกค้า", value: val("customerName") },
    { label: "โทร", value: val("phone") },
    { label: "รายการงาน", value: items },
    { label: "กำหนดรับ", value: val("dueAt") },
  ];
  const reviewCount = (Object.keys(r.fields) as IntakeFieldKey[])
    .filter((k) => {
      const f = r.fields[k];
      return !!f && f.value.trim().length > 0 && f.confidence < LOW_CONFIDENCE;
    }).length;
  return {
    lines: raw.map((l, i) => ({
      no: i + 1,
      label: l.label,
      value: l.value || NOT_SPECIFIED_TEXT,
      found: Boolean(l.value),
    })),
    reviewCount,
    hasAny: raw.some((l) => Boolean(l.value)) || r.items.length > 0,
  };
}
