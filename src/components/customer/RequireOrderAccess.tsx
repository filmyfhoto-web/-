import { ReactNode, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RequireLineLink from "@/components/RequireLineLink";
import { readOrderLinkToken, saveOrderLinkToken } from "@/lib/orderLinkTokens";

/**
 * ทางเข้าหน้า "รายละเอียดคำสั่งซื้อของฉัน"
 *
 * ลูกค้าที่เพิ่งกดสั่งซื้อสำเร็จ (หรือเปิดลิงก์ที่ร้านส่งให้) จะถือโทเคนของ
 * ออเดอร์นั้นอยู่แล้ว — ต้องเห็นสถานะได้ทันที ห้ามมีหน้า "เชื่อม LINE"
 * มาแทรกกลางทางอีก ส่วนกรณีที่ไม่มีโทเคนยังคงผ่านการยืนยัน LINE ตามเดิม
 *
 * ความปลอดภัยไม่ได้ลดลง: ข้อมูลออเดอร์ยังถูกดึงผ่าน RPC/edge function ที่
 * ตรวจสิทธิ์จริงบนเซิร์ฟเวอร์ทุกครั้ง โทเคนเป็นเพียงหลักฐานที่แนบไป
 */
export default function RequireOrderAccess({ children }: { children: ReactNode }) {
  const { id } = useParams();
  const [search] = useSearchParams();
  const fromUrl = search.get("t") || "";

  // เก็บโทเคนจาก URL ไว้ให้เปิดซ้ำได้ภายหลัง (เช่น กดจากประวัติเบราว์เซอร์)
  useEffect(() => {
    if (id && fromUrl) {
      try { saveOrderLinkToken(id, fromUrl); } catch { /* ignore */ }
    }
  }, [id, fromUrl]);

  const token = fromUrl || (id ? readOrderLinkToken(id) : "");
  if (token) return <>{children}</>;
  return <RequireLineLink>{children}</RequireLineLink>;
}
