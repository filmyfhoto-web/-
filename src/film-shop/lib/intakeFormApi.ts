/**
 * ฟอร์ม “รับงานใหม่” ที่เปิดจากกลุ่ม LINE
 * ใช้ token อายุสั้นจากบอทเป็นตัวยืนยันสิทธิ์ (ไม่ต้องล็อกอิน) ผ่าน edge function
 */
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/film-intake-form`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.error) throw new Error((json as any)?.error || `ผิดพลาด (${res.status})`);
  return json as T;
}

export interface IntakeTokenInfo {
  ok: true;
  store_label: string | null;
  expires_at: string;
  used: boolean;
  order_id: string | null;
  /** ข้อมูลที่บอทอ่านจากไฟล์ (ExtractedIntake) — null เมื่อเปิดฟอร์มเปล่า */
  prefill: unknown | null;
}

export const resolveIntakeToken = (token: string) =>
  call<IntakeTokenInfo>({ action: 'resolve', token });

/** อัปโหลดไฟล์แนบผ่าน signed upload URL (ไม่ต้องมี session ผู้ใช้) */
export async function uploadIntakeFile(token: string, file: File): Promise<{ name: string; path: string; url: string }> {
  const signed = await call<{ path: string; signedUrl: string }>({
    action: 'sign_upload', token, filename: file.name,
  });
  const put = await fetch(signed.signedUrl, { method: 'PUT', body: file });
  if (!put.ok) throw new Error(`อัปโหลด "${file.name}" ไม่สำเร็จ`);
  return { name: file.name, path: signed.path, url: '' };
}

export interface IntakeConfirmResult {
  duplicate: boolean;
  order_id: string;
  order_no: string;
  receipt_id: string | null;
  receipt_no: string | null;
}

export const confirmIntakeByToken = (token: string, payload: unknown) =>
  call<IntakeConfirmResult>({ action: 'confirm', token, payload });
