// Shared client helpers for the LINE friend/binding status UI.

export type FriendStatus = "confirmed" | "not_friend" | "unknown" | "config_missing";

export function friendStatusLabel(s: FriendStatus | string | null | undefined): string {
  switch (s) {
    case "confirmed": return "เป็นเพื่อน OA แล้ว";
    case "not_friend": return "ยังไม่ได้เพิ่มเพื่อน";
    case "config_missing": return "ยังไม่ได้ตั้งค่า Channel Access Token";
    case "unknown": return "ตรวจสอบไม่ได้";
    default: return "ยังไม่ตรวจ";
  }
}

export function friendStatusTone(s: FriendStatus | string | null | undefined):
  "success" | "warning" | "destructive" | "muted" {
  if (s === "confirmed") return "success";
  if (s === "not_friend") return "warning";
  if (s === "config_missing") return "destructive";
  if (s === "unknown") return "destructive";
  return "muted";
}

/** Mask a LINE user id for UI display: keep first 5 and last 4 chars. */
export function maskLineUserId(id: string | null | undefined): string {
  if (!id) return "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

/**
 * Human-readable Thai explanation for why a friend-check attempt landed on
 * a given status/reason. Returns null when nothing extra needs to be shown
 * (e.g. `confirmed` — the status label already says it all).
 *
 * `reason` values come from `admin-line-binding-friend-check`; unknown
 * strings fall through to a generic bilingual hint.
 */
export function friendReasonTH(
  reason?: string | null,
  http?: number | null,
): string | null {
  switch (reason) {
    case "ok":
    case "confirmed":
      return null;
    case "not_friend":
      return "ผู้ใช้ยังไม่ได้เพิ่ม OA เป็นเพื่อน";
    case "config_missing":
      return "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ในระบบ";
    case "invalid_id":
      return "รูปแบบ line_user_id ไม่ถูกต้อง";
    case "line_api_401":
      return "โทเคน LINE หมดอายุหรือไม่ถูกต้อง (401)";
    case "line_api_403":
      return "LINE ปฏิเสธคำขอ อาจใช้ Channel คนละตัวกับ OA (403)";
    case "line_api_429":
      return "LINE จำกัดจำนวนคำขอชั่วคราว (429) — ลองใหม่ภายหลัง";
    case "line_api_5xx":
      return `LINE ตอบกลับผิดพลาด (${http ?? "5xx"}) — ลองใหม่อีกครั้ง`;
    case "line_api_other":
      return `LINE ตอบกลับสถานะไม่ปกติ${http ? ` (${http})` : ""}`;
    case "network_error":
      return "เชื่อมต่อ LINE ไม่สำเร็จ กรุณาตรวจเครือข่ายฝั่งเซิร์ฟเวอร์";
    case "forbidden":
      return "บัญชีนี้ไม่มีสิทธิ์แอดมินสำหรับตรวจสถานะเพื่อน";
    case "unauthorized":
      return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบแอดมินอีกครั้ง";
    case "no_line_user_bound_to_account":
      return "ยังไม่มี LINE ผูกกับบัญชีแอดมินของคุณ";
    case "internal_error":
      return "เซิร์ฟเวอร์ตรวจสอบล้มเหลว — ลองใหม่อีกครั้ง";
    default:
      if (!reason) return null;
      return `ตรวจไม่สำเร็จ (${reason}${http ? `, ${http}` : ""})`;
  }
}