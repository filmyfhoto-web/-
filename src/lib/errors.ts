/**
 * Friendly error helper for customer-facing pages.
 * Logs the technical error to console for debugging while returning a safe,
 * human-readable Thai message for `toast.error(...)`.
 */

const PATTERNS: Array<{ re: RegExp; msg: string }> = [
  { re: /invalid login credentials/i, msg: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" },
  { re: /email not confirmed/i, msg: "ยังไม่ได้ยืนยันอีเมล กรุณาตรวจอีเมลของคุณ" },
  { re: /user (already )?registered|already exists/i, msg: "อีเมลนี้ถูกใช้แล้ว กรุณาเข้าสู่ระบบ" },
  { re: /password.*(short|6|weak)/i, msg: "รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร" },
  { re: /rate limit|too many/i, msg: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
  { re: /network|fetch|failed to fetch/i, msg: "เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง" },
  { re: /not configured|missing.*key|not_configured/i, msg: "ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง" },
  { re: /forbidden|not allowed|permission/i, msg: "คุณไม่มีสิทธิ์ทำรายการนี้" },
  { re: /timeout|timed out/i, msg: "ระบบตอบสนองช้า กรุณาลองใหม่" },
];

export function friendlyError(err: unknown, fallback = "เกิดข้อผิดพลาด กรุณาลองใหม่"): string {
  try { console.error("[friendlyError]", err); } catch (_) { /* noop */ }
  const raw = (err as any)?.message || (typeof err === "string" ? err : "") || "";
  for (const p of PATTERNS) if (p.re.test(raw)) return p.msg;
  return fallback;
}