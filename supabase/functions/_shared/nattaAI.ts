/**
 * ม่วงจดให้ — ตัวเชื่อม AI (Lovable AI Gateway)
 *  - ถอดเสียงข้อความเสียงใน LINE เป็นข้อความ (speech-to-text)
 *  - อ่านสลิป/ใบเสร็จจากรูป แล้วสรุปเป็นข้อมูลรายการบัญชี
 *
 * กติกา: ไม่ hardcode คีย์ใด ๆ (อ่านจาก LOVABLE_API_KEY เท่านั้น)
 * และถ้ายังไม่ได้ตั้งคีย์ ต้องคืน `configured: false` ให้ผู้เรียกไป fallback อย่างสุภาพ
 */

declare const Deno: { env: { get(key: string): string | undefined } };

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export function aiConfigured(): boolean {
  return !!Deno.env.get("LOVABLE_API_KEY");
}

/** ดาวน์โหลดไฟล์สื่อจาก LINE (ใช้ทั้งเสียงและรูป) */
export async function downloadLineContent(
  token: string,
  messageId: string,
): Promise<{ ok: true; bytes: Uint8Array; mime: string } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: "ยังไม่ได้ตั้งค่า LINE access token" };
  let res: Response;
  try {
    res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: "ดาวน์โหลดไฟล์จาก LINE ไม่สำเร็จ" };
  }
  if (!res.ok) return { ok: false, reason: `ดาวน์โหลดไฟล์ไม่สำเร็จ (${res.status})` };
  const mime = (res.headers.get("content-type") || "application/octet-stream").split(";")[0];
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) return { ok: false, reason: "ไฟล์ว่าง" };
  return { ok: true, bytes, mime };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** ถอดเสียง → ข้อความ (ไม่มีคีย์ = configured:false, ไม่ throw) */
export async function transcribeAudio(
  bytes: Uint8Array,
  mime: string,
): Promise<{ ok: true; text: string } | { ok: false; configured: boolean; reason: string }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { ok: false, configured: false, reason: "ยังไม่ได้ตั้งค่าคีย์ AI" };
  const ext = mime.includes("mp4") || mime.includes("m4a")
    ? "m4a"
    : mime.includes("mpeg") || mime.includes("mp3")
    ? "mp3"
    : mime.includes("wav")
    ? "wav"
    : "m4a"; // LINE ส่งเสียงเป็น m4a เป็นหลัก
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  form.append("file", new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }), `voice.${ext}`);
  form.append("language", "th");
  try {
    const r = await fetch(`${GATEWAY}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) return { ok: false, configured: true, reason: `ถอดเสียงไม่สำเร็จ (${r.status})` };
    const j = await r.json().catch(() => ({} as any));
    const text = String(j?.text ?? "").trim();
    if (!text) return { ok: false, configured: true, reason: "ไม่ได้ยินข้อความในไฟล์เสียง" };
    return { ok: true, text };
  } catch {
    return { ok: false, configured: true, reason: "ถอดเสียงไม่สำเร็จ" };
  }
}

export interface ReceiptGuess {
  amount: number | null;
  description: string | null;
  type: "income" | "expense" | null;
  payment_method: string | null;
  date: string | null;
}

/** อ่านสลิป/ใบเสร็จจากรูป → ข้อมูลรายการ (ไม่คืน OCR ดิบ) */
export async function extractReceipt(
  bytes: Uint8Array,
  mime: string,
): Promise<{ ok: true; data: ReceiptGuess } | { ok: false; configured: boolean; reason: string }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { ok: false, configured: false, reason: "ยังไม่ได้ตั้งค่าคีย์ AI" };
  const dataUrl = `data:${mime.startsWith("image/") ? mime : "image/jpeg"};base64,${base64(bytes)}`;
  const system = [
    "คุณคือผู้ช่วยอ่านสลิปโอนเงิน/ใบเสร็จของร้านถ่ายรูปและงานพิมพ์",
    "ตอบกลับเป็น JSON เท่านั้น ไม่ต้องอธิบาย รูปแบบ:",
    '{"amount": number|null, "description": string|null, "type": "income"|"expense"|null,',
    '"payment_method": "cash"|"transfer"|"promptpay"|"card"|"ewallet"|"other"|null, "date": "YYYY-MM-DD"|null}',
    "ห้ามคืนเลขบัญชีธนาคาร เลขบัตร หรือข้อมูลส่วนตัวใด ๆ",
    "description ให้สั้น ไม่เกิน 60 ตัวอักษร (เช่น ชื่อร้าน/ชื่อผู้รับ/สิ่งที่ซื้อ)",
    "ถ้าไม่มั่นใจให้ใส่ null",
  ].join(" ");
  try {
    const r = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "อ่านสลิป/ใบเสร็จนี้แล้วตอบ JSON ตามรูปแบบ" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!r.ok) return { ok: false, configured: true, reason: `อ่านสลิปไม่สำเร็จ (${r.status})` };
    const j = await r.json().catch(() => ({} as any));
    const raw = String(j?.choices?.[0]?.message?.content ?? "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, configured: true, reason: "อ่านข้อมูลจากรูปไม่ได้" };
    const parsed = JSON.parse(m[0]) as Record<string, unknown>;
    return { ok: true, data: sanitizeReceipt(parsed) };
  } catch {
    return { ok: false, configured: true, reason: "อ่านสลิปไม่สำเร็จ" };
  }
}

const METHODS = ["cash", "transfer", "promptpay", "card", "ewallet", "other"];

/** ทำความสะอาดผลจาก AI — กันค่าประหลาด/ข้อความยาว/ข้อมูลอ่อนไหว */
export function sanitizeReceipt(input: Record<string, unknown>): ReceiptGuess {
  const amtRaw = Number(String(input.amount ?? "").replace(/[^\d.]/g, ""));
  const amount = Number.isFinite(amtRaw) && amtRaw > 0 ? Math.round(amtRaw * 100) / 100 : null;
  let description = typeof input.description === "string" ? input.description.trim().slice(0, 60) : null;
  // กันเลขบัญชี/เลขบัตรหลุดเข้ามาในรายละเอียด
  if (description && /\d{8,}/.test(description.replace(/[\s-]/g, ""))) description = null;
  const type = input.type === "income" || input.type === "expense" ? input.type : null;
  const pm = typeof input.payment_method === "string" && METHODS.includes(input.payment_method)
    ? input.payment_method
    : null;
  const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
  return { amount, description: description || null, type, payment_method: pm, date };
}
