import { Navigate, useLocation } from "react-router-dom";

/**
 * เส้นทางเก่า `/receipts/film` ถูกยกเลิกถาวร — เหลือไว้เป็น redirect ที่คุมเงื่อนไข
 * เท่านั้น เพื่อไม่ให้หน้าโครงเก่ากลับมาแสดงอีก
 *   - `/receipts/film`            → `/film-shop` (หน้าแรกร้าน)
 *   - `/receipts/film?p=...`      → `/film-shop/app?p=...` (deep link หน้างานย่อยเดิม)
 *   - `/receipts/film/<sub>`      → `/film-shop/app/<sub>`
 */
export default function FilmShopEntry() {
  const { pathname, search, hash } = useLocation();
  const sub = pathname.replace(/^\/receipts\/film\/?/, "");
  const hasDeepLink = sub.length > 0 || new URLSearchParams(search).has("p");
  const to = hasDeepLink ? `/film-shop/app${sub ? `/${sub}` : ""}${search}${hash}` : "/film-shop";
  return <Navigate to={to} replace />;
}
