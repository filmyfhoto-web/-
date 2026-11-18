/**
 * ร่างข้อมูลผู้สั่งซื้อในตะกร้า — เก็บไว้ให้ลูกค้าที่ออกจากหน้าไป
 * "เพิ่มเพื่อน LINE" แล้วกลับมาไม่ต้องกรอกใหม่ (ไม่มีข้อมูลลับ/โทเคนใด ๆ)
 */
export type CheckoutDraft = {
  name?: string; phone?: string; project?: string;
  school?: string; taxId?: string; taxBranch?: string;
};

const KEY = "cart_checkout_draft_v1";

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as CheckoutDraft) : null;
  } catch { return null; }
}

export function writeCheckoutDraft(d: CheckoutDraft): void {
  try {
    const hasValue = Object.values(d).some((v) => String(v ?? "").trim() !== "");
    if (!hasValue) return;
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch { /* ignore */ }
}

export function clearCheckoutDraft(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
