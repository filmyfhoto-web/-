/**
 * Customer perks for the นัฐภรณ์ เชียงกลาง storefront — coupons and loyalty points.
 *
 * Deliberately deterministic and rule-based (no invented wallet / finance
 * products). Every rule below is enforced client-side for the preview totals
 * and re-stated in the order note so the shop can honour it when quoting.
 */

export interface Coupon {
  code: string;
  label: string;
  /** Minimum selected subtotal (THB) required to use the coupon. */
  minSpend: number;
  /** Percentage discount (0-100). Either percent or amount is used. */
  percent?: number;
  /** Flat discount in THB. */
  amount?: number;
  /** Upper bound of the discount in THB. */
  maxDiscount?: number;
}

/** Shop-issued coupons. Codes are case-insensitive. */
export const SHOP_COUPONS: Coupon[] = [
  { code: "NATTA50", label: "ลด 50 บาท เมื่อสั่งครบ 500 บาท", minSpend: 500, amount: 50 },
  { code: "PRINT10", label: "ลด 10% งานพิมพ์ (สูงสุด 200 บาท)", minSpend: 300, percent: 10, maxDiscount: 200 },
  { code: "SCHOOL5", label: "ลด 5% สำหรับโรงเรียน/หน่วยงาน", minSpend: 0, percent: 5, maxDiscount: 500 },
];

export interface CouponResult {
  ok: boolean;
  coupon?: Coupon;
  discount: number;
  message: string;
}

export function applyCoupon(rawCode: string, subtotal: number): CouponResult {
  const code = (rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, discount: 0, message: "กรุณากรอกรหัสคูปอง" };
  const coupon = SHOP_COUPONS.find((c) => c.code === code);
  if (!coupon) return { ok: false, discount: 0, message: "ไม่พบรหัสคูปองนี้" };
  if (subtotal < coupon.minSpend) {
    return {
      ok: false,
      coupon,
      discount: 0,
      message: `ต้องมียอดสั่งซื้อขั้นต่ำ ${coupon.minSpend.toLocaleString("th-TH")} บาท`,
    };
  }
  let discount = coupon.amount ?? 0;
  if (coupon.percent) discount = (subtotal * coupon.percent) / 100;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(Math.round(discount), subtotal);
  return { ok: true, coupon, discount, message: `ใช้คูปอง ${coupon.code} แล้ว` };
}

/** 1 แต้ม ต่อยอดใช้จ่ายทุก 20 บาท */
export const POINTS_PER_BAHT = 1 / 20;
/** 100 แต้ม = ส่วนลด 20 บาท */
export const POINTS_REDEEM_STEP = 100;
export const POINTS_REDEEM_VALUE = 20;

export function pointsEarned(subtotal: number): number {
  return Math.floor(Math.max(0, subtotal) * POINTS_PER_BAHT);
}

/** ส่วนลดสูงสุดที่แลกได้จากแต้มคงเหลือ (ไม่เกิน 50% ของยอด) */
export function pointsDiscount(balance: number, subtotal: number): number {
  const steps = Math.floor(Math.max(0, balance) / POINTS_REDEEM_STEP);
  const raw = steps * POINTS_REDEEM_VALUE;
  return Math.max(0, Math.min(raw, Math.floor(subtotal * 0.5)));
}

const POINTS_KEY = "customer_points_v1";

export function readPointsBalance(): number {
  try {
    const v = Number(localStorage.getItem(POINTS_KEY) || "0");
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

export function addPoints(n: number): number {
  const next = readPointsBalance() + Math.max(0, Math.floor(n));
  try { localStorage.setItem(POINTS_KEY, String(next)); } catch { /* ignore */ }
  return next;
}
