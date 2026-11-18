import { Navigate, useLocation } from "react-router-dom";

/**
 * หน้าประวัติคำสั่งซื้อถูกรวมเข้ากับหน้า "ฉัน" (/my-account) แล้ว
 * เหลือไว้เป็นทางเปลี่ยนเส้นทาง เพื่อไม่ให้ลิงก์เก่า (รวมถึงลิงก์ในข้อความ LINE)
 * ที่ชี้มา /my-orders หรือ /account/orders?order=... พัง — query ทั้งหมดถูกส่งต่อ
 */
export default function MyOrders() {
  const { search, hash } = useLocation();
  return <Navigate to={`/my-account${search}${hash}`} replace />;
}
