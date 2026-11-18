/** โปรโมชั่น/แคมเปญที่แอดมินจัดการเอง (ตาราง shop_promos) */
export interface ShopPromo {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort: number;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** เผยแพร่อยู่และอยู่ในช่วงวันที่ที่กำหนด (เว้นว่าง = ไม่จำกัด) */
export function isPromoLive(p: ShopPromo, now: Date = new Date()): boolean {
  if (!p.is_active) return false;
  const t = now.getTime();
  if (p.starts_at) {
    const s = new Date(p.starts_at).getTime();
    if (Number.isFinite(s) && t < s) return false;
  }
  if (p.ends_at) {
    const e = new Date(p.ends_at).getTime();
    if (Number.isFinite(e) && t > e) return false;
  }
  return true;
}

export function livePromos(rows: ShopPromo[], now: Date = new Date()): ShopPromo[] {
  return rows.filter((p) => isPromoLive(p, now)).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}
