/**
 * แปลง error code จาก `guest-order-submit` (นโยบาย fail-closed ของ LINE OA gate)
 * ให้เป็นการ์ดไทยที่ลูกค้าเข้าใจได้ โดยไม่ทำให้ catalog/cart ล่ม
 *
 * action:
 *  - "add_friend"   → เปิดการ์ดให้เพิ่มเพื่อน LINE
 *  - "recheck"      → ตรวจสอบใหม่อีกครั้ง (LINE ตอบไม่ได้ชั่วคราว)
 *  - "contact_shop" → ร้านตั้งค่า LINE ไม่ครบ ต้องแจ้งร้าน
 *  - "login"        → ยังไม่ได้ล็อกอิน/ผูก LINE
 *  - "refresh"      → ให้รีเฟรชหน้าแล้วลองใหม่
 */
export type LineOrderBlockAction =
  | "add_friend" | "recheck" | "contact_shop" | "login" | "refresh";

export type LineOrderBlock = {
  action: LineOrderBlockAction;
  message: string;
  /** เปิดการ์ด LineOrderGate หรือไม่ */
  openGate: boolean;
};

export function mapLineOrderError(
  code: unknown,
  detail?: unknown,
): LineOrderBlock | null {
  const c = String(code ?? "");
  const d = typeof detail === "string" && detail.trim() ? detail.trim() : null;
  switch (c) {
    case "LINE_NOT_FRIEND":
    case "line_friend_required":
      return {
        action: "add_friend",
        message: d || "กรุณาเพิ่มเพื่อน LINE ของร้านก่อนยืนยันสั่งซื้อ",
        openGate: true,
      };
    case "LINE_FRIEND_CHECK_UNAVAILABLE":
      return {
        action: "recheck",
        message: d || "ตรวจสอบสถานะเพื่อน LINE ไม่สำเร็จ กรุณาลองตรวจสอบใหม่อีกครั้ง",
        openGate: true,
      };
    case "LINE_CONFIG_MISSING":
      return {
        action: "contact_shop",
        message: d || "ร้านยังตั้งค่า LINE ไม่ครบ กรุณาแจ้งร้านเพื่อเปิดการสั่งซื้อ",
        openGate: false,
      };
    case "line_required":
      return {
        action: "login",
        message: d || "กรุณาเข้าสู่ระบบด้วย LINE ก่อนสั่งซื้อ",
        openGate: true,
      };
    case "line_binding_required":
      return {
        action: "login",
        message: d || "กรุณาเพิ่มเพื่อนและผูก LINE กับร้านก่อนสั่งซื้อ",
        openGate: true,
      };
    case "missing_idempotency_key":
      return { action: "refresh", message: "กรุณารีเฟรชหน้าแล้วลองใหม่", openGate: false };
    default:
      return null;
  }
}
