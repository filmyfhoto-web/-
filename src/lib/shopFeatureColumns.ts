import { Star, Zap, Flame, Sparkles, Clock3, Package, Truck, Gift, Printer, Palette, type LucideIcon } from "lucide-react";

/** โทนสีของคอลัมน์เมนูพิเศษ — อ้างอิงโทเคน --svc-* ในธีมหน้าร้าน */
export type FeatureTone = "blue" | "orange" | "green" | "purple" | "pink";

export const TONE_TOKEN: Record<FeatureTone, string> = {
  blue: "--svc-1",
  orange: "--svc-3",
  green: "--svc-2",
  purple: "--svc-5",
  pink: "--svc-4",
};

export const TONE_LABEL: Record<FeatureTone, string> = {
  blue: "น้ำเงิน",
  orange: "ส้ม",
  green: "เขียว",
  purple: "ม่วง",
  pink: "ชมพู",
};

export function toneToken(tone?: string | null): string {
  return TONE_TOKEN[(tone as FeatureTone) ?? "blue"] ?? TONE_TOKEN.blue;
}

/** ไอคอนที่เลือกได้ในหน้าจัดการเมนูพิเศษ */
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  Star, Zap, Flame, Sparkles, Clock3, Package, Truck, Gift, Printer, Palette,
};

export const FEATURE_ICON_NAMES = Object.keys(FEATURE_ICONS);

export function resolveFeatureIcon(name?: string | null): LucideIcon {
  return (name && FEATURE_ICONS[name]) || Star;
}

/** แหล่งข้อมูลอัตโนมัติ — ใช้สินค้าจริงจากระบบเมื่อยังไม่ได้ปักรายการเอง */
export type FeatureAutoSource = "none" | "popular" | "rush" | "recommended";

export const AUTO_SOURCE_LABEL: Record<FeatureAutoSource, string> = {
  none: "กำหนดรายการเอง",
  popular: "บริการยอดนิยม (อัตโนมัติ)",
  rush: "งานด่วน (อัตโนมัติ)",
  recommended: "สินค้าแนะนำ (อัตโนมัติ)",
};

export interface FeatureItemRow {
  id: string;
  column_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  price_text: string | null;
  badge_text: string | null;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface FeatureColumnRow {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  icon_name: string | null;
  tone: FeatureTone | string;
  auto_source: FeatureAutoSource | string;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
}

/** ค่าเริ่มต้น (ใช้เมื่อยังไม่มีข้อมูลในฐานข้อมูล) */
export const DEFAULT_FEATURE_COLUMNS: FeatureColumnRow[] = [
  { id: "default-popular", key: "popular", title: "บริการยอดนิยม", subtitle: "ลูกค้าสั่งบ่อยที่สุด", icon_name: "Star", tone: "blue", auto_source: "popular", link_url: null, sort_order: 0, is_active: true },
  { id: "default-rush", key: "rush", title: "งานด่วน", subtitle: "รับงานได้ทันที", icon_name: "Zap", tone: "orange", auto_source: "rush", link_url: null, sort_order: 1, is_active: true },
  { id: "default-foryou", key: "foryou", title: "แนะนำสำหรับคุณ", subtitle: "คัดมาให้โดยเฉพาะ", icon_name: "Flame", tone: "green", auto_source: "recommended", link_url: null, sort_order: 2, is_active: true },
];

/** คอลัมน์ที่เปิดใช้งาน เรียงตามลำดับที่แอดมินตั้งไว้ */
export function visibleColumns(rows: FeatureColumnRow[]): FeatureColumnRow[] {
  return rows.filter((c) => c.is_active).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** รายการย่อยที่เปิดใช้งานของคอลัมน์นั้น (จำกัดจำนวนให้การ์ดกระชับ) */
export function columnItems(items: FeatureItemRow[], columnId: string, limit = 3): FeatureItemRow[] {
  return items
    .filter((i) => i.column_id === columnId && i.is_active)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, limit);
}
