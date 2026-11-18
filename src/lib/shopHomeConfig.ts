import {
  IdCard, Printer, Flag, Sticker, Stamp, BookOpen, PenLine, Palette, Truck, Copy,
  Camera, Scissors, Package, Gift, Image as ImageIcon, FileText, Mail, Phone, Star, Heart,
  type LucideIcon,
} from "lucide-react";

/** ไอคอนที่แอดมินเลือกได้ในหน้าจัดการเมนูบริการ */
export const ICON_LIBRARY: Record<string, LucideIcon> = {
  Copy, Printer, IdCard, Flag, Sticker, Stamp, PenLine, BookOpen, Palette, Truck,
  Camera, Scissors, Package, Gift, ImageIcon, FileText, Mail, Phone, Star, Heart,
};

export const ICON_NAMES = Object.keys(ICON_LIBRARY);

export function resolveIcon(name?: string | null): LucideIcon {
  return (name && ICON_LIBRARY[name]) || Package;
}

export interface ServiceShortcutRow {
  id: string;
  key: string;
  label: string;
  icon_name: string | null;
  icon_url: string | null;
  target_type: "search" | "route";
  target_value: string;
  sort_order: number;
  is_active: boolean;
}

/** เมนูเริ่มต้น (ใช้เมื่อยังไม่มีข้อมูลในฐานข้อมูล) */
export const DEFAULT_SHORTCUTS: Omit<ServiceShortcutRow, "id">[] = [
  { key: "copy", label: "ถ่ายเอกสาร", icon_name: "Copy", icon_url: null, target_type: "search", target_value: "ถ่ายเอกสาร", sort_order: 0, is_active: true },
  { key: "docprint", label: "พิมพ์งาน", icon_name: "Printer", icon_url: null, target_type: "search", target_value: "พิมพ์งาน", sort_order: 1, is_active: true },
  { key: "idphoto", label: "รูปติดบัตร", icon_name: "IdCard", icon_url: null, target_type: "search", target_value: "รูปติดบัตร", sort_order: 2, is_active: true },
  { key: "vinyl", label: "ป้ายไวนิล", icon_name: "Flag", icon_url: null, target_type: "search", target_value: "ไวนิล", sort_order: 3, is_active: true },
  { key: "sticker", label: "สติ๊กเกอร์", icon_name: "Sticker", icon_url: null, target_type: "search", target_value: "สติ๊กเกอร์", sort_order: 4, is_active: true },
  { key: "stamp", label: "ตรายาง", icon_name: "Stamp", icon_url: null, target_type: "search", target_value: "ตรายาง", sort_order: 5, is_active: true },
  { key: "stationery", label: "เครื่องเขียน", icon_name: "PenLine", icon_url: null, target_type: "search", target_value: "เครื่องเขียน", sort_order: 6, is_active: true },
  { key: "binding", label: "เข้าเล่ม", icon_name: "BookOpen", icon_url: null, target_type: "search", target_value: "เข้าเล่ม", sort_order: 7, is_active: true },
  { key: "design", label: "ออกแบบ", icon_name: "Palette", icon_url: null, target_type: "search", target_value: "ออกแบบ", sort_order: 8, is_active: true },
  { key: "delivery", label: "รับส่งงาน", icon_name: "Truck", icon_url: null, target_type: "search", target_value: "รับส่ง", sort_order: 9, is_active: true },
];

export interface ShopTheme {
  primary_hsl: string;
  accent_hsl: string;
  gradient_strength: number;
  icon_size: "sm" | "md" | "lg";
  icon_columns: number;
  /** ตัวคูณขนาดตัวอักษรของหน้าลูกค้า (0.9 – 1.2) */
  font_scale: number;
  /** ข้อมูลร้านที่แสดงบนการ์ดหน้าแรก */
  shop_name: string | null;
  shop_logo_url: string | null;
  shop_line_id: string | null;
  /** ลำดับและการเปิด/ปิดของแต่ละส่วนบนหน้าแรกลูกค้า */
  sections: ShopSectionPref[];
}

export type ShopSectionKey = "store" | "services" | "banners" | "recommended" | "nav";

export interface ShopSectionPref {
  key: ShopSectionKey;
  visible: boolean;
}

export const SECTION_LABELS: Record<ShopSectionKey, string> = {
  store: "ข้อมูลร้าน",
  services: "เมนูบริการ",
  banners: "แบนเนอร์ / โปรโมชัน",
  recommended: "สินค้าแนะนำ",
  nav: "แถบนำทางด้านล่าง",
};

export const DEFAULT_SECTIONS: ShopSectionPref[] = [
  { key: "store", visible: true },
  { key: "services", visible: true },
  { key: "banners", visible: true },
  { key: "recommended", visible: true },
  { key: "nav", visible: true },
];

/** อ่านค่า sections จากฐานข้อมูลอย่างปลอดภัย (คืนค่าเริ่มต้นเมื่อข้อมูลเพี้ยน) */
export function normalizeSections(raw: unknown): ShopSectionPref[] {
  if (!Array.isArray(raw)) return DEFAULT_SECTIONS;
  const seen = new Set<string>();
  const out: ShopSectionPref[] = [];
  for (const item of raw as any[]) {
    const key = item?.key as ShopSectionKey;
    if (!key || seen.has(key) || !(key in SECTION_LABELS)) continue;
    seen.add(key);
    out.push({ key, visible: item?.visible !== false });
  }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.key)) out.push({ ...d });
  return out;
}

/** ส่วนนี้ถูกเปิดให้ลูกค้าเห็นหรือไม่ */
export function isSectionVisible(sections: ShopSectionPref[] | undefined, key: ShopSectionKey): boolean {
  const found = (sections ?? DEFAULT_SECTIONS).find((s) => s.key === key);
  return found ? found.visible : true;
}

export const DEFAULT_THEME: ShopTheme = {
  /* โทนตามภาพตัวอย่าง: ฟ้าน้ำเงินสด (royal blue) + ฟ้าอ่อน */
  primary_hsl: "214 84% 47%",
  accent_hsl: "204 94% 66%",
  gradient_strength: 50,
  icon_size: "md",
  icon_columns: 5,
  font_scale: 1,
  shop_name: "นัฐภรณ์ เชียงกลาง",
  shop_logo_url: null,
  shop_line_id: null,
  sections: DEFAULT_SECTIONS,
};

/** ชุดสีสำเร็จให้เลือกในหน้าตั้งค่าธีม */
export const THEME_PRESETS: { label: string; primary: string; accent: string }[] = [
  { label: "กรมท่า (ค่าเริ่มต้น)", primary: "208 53% 19%", accent: "40 64% 62%" },
  { label: "ฟ้าสดใส", primary: "210 92% 42%", accent: "38 92% 55%" },
  { label: "ม่วงพลัม", primary: "292 40% 32%", accent: "40 64% 62%" },
  { label: "เขียวมรกต", primary: "162 62% 24%", accent: "45 80% 55%" },
  { label: "ส้มอบอุ่น", primary: "20 88% 44%", accent: "200 70% 45%" },
];

/** แปลงค่า hex เป็นสตริง HSL แบบ "H S% L%" ที่ใช้กับ CSS variable ได้ */
export function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** แปลง "H S% L%" กลับเป็น hex เพื่อใช้กับ <input type="color"> */
export function hslToHex(hsl: string): string {
  const m = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(hsl);
  if (!m) return "#17324d";
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** ปรับความสว่างของสี HSL (ใช้สร้าง glow / gradient) */
export function lighten(hsl: string, by: number): string {
  const m = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(hsl);
  if (!m) return hsl;
  const l = Math.max(0, Math.min(100, Number(m[3]) + by));
  return `${m[1]} ${m[2]}% ${l}%`;
}

/** CSS variable ที่จะฉีดทับบนรากของหน้าร้านลูกค้า */
export function themeCssVars(t: ShopTheme): Record<string, string> {
  const glow = lighten(t.primary_hsl, 12);
  const g = Math.max(0, Math.min(100, t.gradient_strength)) / 100;
  const scale = Math.max(0.85, Math.min(1.3, Number(t.font_scale) || 1));
  return {
    "--primary": t.primary_hsl,
    "--primary-glow": glow,
    "--ring": t.primary_hsl,
    "--champagne": t.accent_hsl,
    "--gradient-primary": `linear-gradient(135deg, hsl(${t.primary_hsl}) 0%, hsl(${glow}) 100%)`,
    "--shop-gradient-strength": String(g),
    "--app-font-scale": String(scale),
  };
}