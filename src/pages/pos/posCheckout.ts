/**
 * Shared POS checkout primitives.
 *
 * Both the classic POS (`/pos`) and the touch register (`/pos/register`) go
 * through the same `pos_checkout` RPC — same idempotency key shape, same
 * error mapping — so a sale never behaves differently between the two
 * screens and one tap can never commit twice.
 */

/** Thai labels for the payment channels supported by `pos_checkout`. */
export const PAY_TYPE_LABEL: Record<string, string> = {
  cash: "เงินสด",
  qr: "QR",
  transfer: "โอน",
  card: "บัตร",
  credit: "ลงบัญชี",
};

export function newIdemKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `pos-${(crypto as { randomUUID: () => string }).randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function mapCheckoutError(msg: string): string {
  if (!msg) return "เกิดข้อผิดพลาด";
  if (msg.includes("insufficient_stock")) return "สต๊อกไม่พอสำหรับบางรายการ กรุณารีเฟรชและลองใหม่";
  if (msg.includes("variant_inactive")) return "ตัวเลือกสินค้าถูกปิดใช้งาน";
  if (msg.includes("variant_product_mismatch")) return "ตัวเลือกไม่ตรงกับสินค้า";
  if (msg.includes("variant_required")) return "กรุณาเลือกตัวเลือกสินค้าให้ครบก่อนชำระเงิน";
  if (msg.includes("variant_not_found")) return "ไม่พบตัวเลือกสินค้าในระบบ";
  if (msg.includes("product_inactive")) return "สินค้าบางรายการถูกปิดใช้งาน";
  if (msg.includes("product_not_found")) return "ไม่พบสินค้าในระบบ";
  if (msg.includes("not_authorized")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  return msg;
}

/** Order channel tag stored with the sale (no payment integration implied). */
export type PosSaleSource = "storefront" | "facebook" | "shopee" | "lazada" | "line_oa" | "tiktok";

export const SALE_SOURCES: { key: PosSaleSource; label: string }[] = [
  { key: "storefront", label: "หน้าร้าน" },
  { key: "facebook", label: "Facebook" },
  { key: "shopee", label: "Shopee" },
  { key: "lazada", label: "Lazada" },
  { key: "line_oa", label: "LINE OA" },
  { key: "tiktok", label: "TikTok" },
];
