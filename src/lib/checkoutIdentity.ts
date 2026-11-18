/**
 * Resolve the customer identity used at checkout.
 *
 * ลูกค้าไม่ต้องพิมพ์ชื่อ/เบอร์ซ้ำ — ระบบดึงจากบัญชี LINE ที่ผูกไว้แล้ว
 * (server-verified profile → binding ที่เกตยืนยัน → guest session)
 * ถ้าข้อมูลที่จำเป็นยังขาด ให้ขอเฉพาะช่องที่ขาดก่อนยืนยันคำสั่งซื้อ
 */
export type IdentitySource = {
  lineProfile?: { line_user_id?: string | null; display_name?: string | null; customer_name?: string | null; phone?: string | null } | null;
  binding?: { line_user_id?: string; customer_name?: string | null; phone?: string } | null;
  session?: { name?: string | null; phone?: string | null } | null;
};

export type CheckoutIdentity = {
  /** ชื่อผู้สั่ง (จากบัญชีที่ผูกไว้) — "" ถ้ายังไม่มี */
  name: string;
  /** เบอร์โทร — "" ถ้ายังไม่มี */
  phone: string;
  /** LINE user id ที่ยืนยันแล้ว (ถ้ามี) */
  lineUserId: string | null;
  /** มีบัญชี LINE ผูกกับร้านแล้วหรือยัง */
  linked: boolean;
  /** ต้องขอข้อมูลเพิ่มก่อนยืนยันไหม */
  missing: Array<"name" | "phone">;
};

const clean = (v: unknown) => String(v ?? "").trim();
export const isValidThaiPhone = (v: string) => /^0\d{8,9}$/.test(v.replace(/[\s-]/g, ""));

export function resolveCheckoutIdentity(src: IdentitySource): CheckoutIdentity {
  const { lineProfile, binding, session } = src;
  const name =
    clean(lineProfile?.customer_name) ||
    clean(lineProfile?.display_name) ||
    clean(binding?.customer_name) ||
    clean(session?.name);
  const phone = clean(lineProfile?.phone) || clean(binding?.phone) || clean(session?.phone);
  const lineUserId = clean(lineProfile?.line_user_id) || clean(binding?.line_user_id) || "";
  const missing: Array<"name" | "phone"> = [];
  if (name.length < 2) missing.push("name");
  if (!isValidThaiPhone(phone)) missing.push("phone");
  return { name, phone, lineUserId: lineUserId || null, linked: !!lineUserId, missing };
}
