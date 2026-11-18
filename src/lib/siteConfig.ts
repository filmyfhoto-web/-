/**
 * ค่าคอนฟิกของหน้าเว็บไซต์สาธารณะ (public landing "NATTA GROUP")
 *
 * ค่าเริ่มต้นทั้งหมดคือ “ข้อความที่หน้าเว็บใช้อยู่จริงตอนนี้” — ถ้ายังไม่เคยกดบันทึก
 * จากหน้า “จัดการหน้าเว็บไซต์” หรือโหลดค่าจากฐานข้อมูลไม่สำเร็จ หน้า public
 * จะแสดงผลเหมือนเดิม 100%
 *
 * ไฟล์นี้เป็น presentation config ล้วน ๆ — ไม่ยุ่งกับ orders / documents / POS /
 * queue / group bot
 */

export const SITE_SETTINGS_TABLE = "site_settings";
/** มุมมองสาธารณะ (เฉพาะคอนฟิกที่ใช้แสดงหน้าเว็บ) */
export const SITE_SETTINGS_PUBLIC_VIEW = "site_settings_public";
export const WEBSITE_ASSET_BUCKET = "website-assets";

export const DEFAULT_LINE_OA_URL = "https://lin.ee/QaMCxQg";

export type SiteMenuKind = "route" | "anchor" | "external";

export interface SiteMenuItem {
  id: string;
  label: string;
  to: string;
  kind: SiteMenuKind;
  visible: boolean;
}

export type SiteHighlightIcon = "shield" | "zap" | "sparkles";

export interface SiteHighlight {
  id: string;
  icon: SiteHighlightIcon;
  title: string;
  desc: string;
  visible: boolean;
}

export type SiteSectionKey = "hero" | "highlights" | "order" | "categories" | "contact";

/** ตำแหน่งการจัดวางรูปโชว์ */
export type SiteImageAlign = "left" | "center" | "right";

export const HERO_SCALE_MIN = 80;
export const HERO_SCALE_MAX = 160;
export const HERO_SCALE_DEFAULT = 140;
/** ค่าเริ่มต้นแยกตามหน้าจอ — มือถือเล็กลงเพื่อไม่ให้ layout เสีย */
export const HERO_SCALE_DEFAULT_MOBILE = 105;
export const HERO_SCALE_DEFAULT_TABLET = 120;

export type HeroBreakpoint = "mobile" | "tablet" | "desktop";

export const HERO_BREAKPOINTS: { key: HeroBreakpoint; label: string; hint: string }[] = [
  { key: "mobile", label: "มือถือ", hint: "< 640px" },
  { key: "tablet", label: "แท็บเล็ต", hint: "640–1023px" },
  { key: "desktop", label: "เดสก์ท็อป", hint: "≥ 1024px" },
];

export const clampHeroScale = (v: unknown, fallback = HERO_SCALE_DEFAULT): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(HERO_SCALE_MAX, Math.max(HERO_SCALE_MIN, n));
};

export const toHeroAlign = (v: unknown, fallback: SiteImageAlign = "center"): SiteImageAlign =>
  v === "left" || v === "center" || v === "right" ? v : fallback;

/** อ่านค่าขนาด/ตำแหน่งของ breakpoint ที่ต้องการ (fallback → ค่าเดสก์ท็อป) */
export const heroScaleOf = (cfg: SiteConfig, bp: HeroBreakpoint): number =>
  bp === "mobile"
    ? clampHeroScale(cfg.hero_image_scale_mobile, HERO_SCALE_DEFAULT_MOBILE)
    : bp === "tablet"
      ? clampHeroScale(cfg.hero_image_scale_tablet, HERO_SCALE_DEFAULT_TABLET)
      : clampHeroScale(cfg.hero_image_scale);

export const heroAlignOf = (cfg: SiteConfig, bp: HeroBreakpoint): SiteImageAlign =>
  bp === "mobile"
    ? toHeroAlign(cfg.hero_image_align_mobile, cfg.hero_image_align)
    : bp === "tablet"
      ? toHeroAlign(cfg.hero_image_align_tablet, cfg.hero_image_align)
      : toHeroAlign(cfg.hero_image_align);

export interface SiteSectionPref {
  key: SiteSectionKey;
  visible: boolean;
}

/** ปลายทางของปุ่ม (label กับ destination แยกกันเสมอ) */
export interface SiteCta {
  enabled: boolean;
  label: string;
  kind: SiteMenuKind;
  to: string;
}

export interface SiteConfig {
  brand_label: string;
  hero_title_line1: string;
  hero_title_line2: string;
  hero_desc: string;
  hours_label: string;
  hours_text: string;
  /** ลิงก์รูป hero (signed URL จาก bucket website-assets) — null = ใช้รูปเดิมในโค้ด */
  hero_image_url: string | null;
  /** ขนาดรูปโชว์บนหน้าแรก (%) 80–160 — ค่าเดสก์ท็อป */
  hero_image_scale: number;
  /** ขนาดรูปโชว์เฉพาะมือถือ (%) */
  hero_image_scale_mobile: number;
  /** ขนาดรูปโชว์เฉพาะแท็บเล็ต (%) */
  hero_image_scale_tablet: number;
  /** ตำแหน่งการครอปรูปโชว์ — ค่าเดสก์ท็อป */
  hero_image_align: SiteImageAlign;
  /** ตำแหน่งรูปเฉพาะมือถือ */
  hero_image_align_mobile: SiteImageAlign;
  /** ตำแหน่งรูปเฉพาะแท็บเล็ต */
  hero_image_align_tablet: SiteImageAlign;
  /** ลิงก์รูปโชว์บนแบนเนอร์แดชบอร์ดหลังบ้าน — null = ไม่แสดงรูป */
  dashboard_image_url: string | null;
  highlights: SiteHighlight[];
  menu: SiteMenuItem[];
  line_cta: { enabled: boolean; label: string; url: string; note: string };
  cta_shop: SiteCta;
  cta_orders: SiteCta;
  /** ปุ่มเปิดหน้าใบเขียนเบิก (เอกสารประมาณการ) */
  cta_requisition: SiteCta;
  /** ปุ่มบนการ์ดหมวดหมู่สินค้า/บริการ */
  cta_categories: SiteCta;
  order_title: string;
  order_desc: string;
  sections: SiteSectionPref[];
}

/** section ที่ตำแหน่งตายตัว (hero อยู่บนสุดเสมอ / จุดเด่นอยู่ในกล่อง hero) */
export const LOCKED_SECTIONS: SiteSectionKey[] = ["hero", "highlights"];

export const SECTION_LABELS: Record<SiteSectionKey, string> = {
  hero: "แบนเนอร์หลัก (Hero)",
  highlights: "จุดเด่น 3 ใบ",
  order: "สั่งซื้อสินค้ากับร้าน",
  categories: "หมวดหมู่สินค้าและบริการ",
  contact: "ข้อมูลร้าน / ติดต่อเรา",
};

/** ปลายทางเมนูที่เป็น route จริงในระบบ — แก้ชื่อเมนูไม่ทำให้ route พัง */
export const PUBLIC_ROUTE_OPTIONS: { to: string; label: string }[] = [
  { to: "/", label: "หน้าแรก" },
  { to: "/shop", label: "สั่งซื้อสินค้า" },
  { to: "/cart", label: "ตะกร้าสินค้า" },
  { to: "/my-orders", label: "คำสั่งซื้อของฉัน" },
  { to: "/account", label: "บัญชีของฉัน" },
  { to: "/login", label: "เข้าสู่ระบบ" },
  
  { to: "/promotions", label: "โปรโมชั่น" },
  { to: "/privacy", label: "นโยบายความเป็นส่วนตัว" },
  { to: "/terms", label: "เงื่อนไขการใช้งาน" },
];

export const ANCHOR_OPTIONS: { to: string; label: string }[] = [
  { to: "#contact", label: "ส่วนติดต่อเรา (ในหน้าแรก)" },
];

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  brand_label: "NATTA GROUP · เชียงกลาง น่าน",
  hero_title_line1: "งานพิมพ์ ที่ใช่",
  hero_title_line2: "บริการ ที่คุณไว้ใจ",
  hero_desc:
    "ครบจบในที่เดียว ไม่ว่าจะงานพิมพ์ เครื่องเขียน ของใช้สำนักงาน ป้ายโฆษณา และงานออกแบบ",
  hours_label: "เปิดบริการ",
  hours_text: "จันทร์ - เสาร์ 08.00 - 18.00 น.",
  hero_image_url: null,
  hero_image_scale: HERO_SCALE_DEFAULT,
  hero_image_scale_mobile: HERO_SCALE_DEFAULT_MOBILE,
  hero_image_scale_tablet: HERO_SCALE_DEFAULT_TABLET,
  hero_image_align: "center",
  hero_image_align_mobile: "center",
  hero_image_align_tablet: "center",
  dashboard_image_url: null,
  highlights: [
    { id: "quality", icon: "shield", title: "คุณภาพดี", desc: "งานพิมพ์คมชัด วัสดุคัดมา", visible: true },
    { id: "fast", icon: "zap", title: "รวดเร็ว", desc: "รับงานด่วน ทันกำหนด", visible: true },
    { id: "safe", icon: "sparkles", title: "ปลอดภัย", desc: "ติดตามงานได้ทุกขั้นตอน", visible: true },
  ],
  menu: [
    { id: "home", label: "หน้าแรก", to: "/", kind: "route", visible: true },
    { id: "shop", label: "สั่งซื้อสินค้า", to: "/shop", kind: "route", visible: true },
    { id: "my-orders", label: "คำสั่งซื้อของฉัน", to: "/my-orders", kind: "route", visible: true },
    { id: "promotions", label: "โปรโมชั่น", to: "/promotions", kind: "route", visible: true },
    { id: "contact", label: "ติดต่อเรา", to: "#contact", kind: "anchor", visible: true },
  ],
  line_cta: {
    enabled: true,
    label: "เพิ่มเพื่อนใน LINE",
    url: DEFAULT_LINE_OA_URL,
    note: "เพื่อรับข่าวสารและโปรโมชั่น",
  },
  cta_shop: { enabled: true, label: "ดูสินค้า / สั่งซื้อ", kind: "route", to: "/shop" },
  cta_orders: { enabled: true, label: "คำสั่งซื้อของฉัน", kind: "route", to: "/my-orders" },
  cta_requisition: { enabled: false, label: "ใบเขียนเบิก", kind: "route", to: "/cart" },
  cta_categories: { enabled: true, label: "หมวดหมู่สินค้าและบริการ", kind: "route", to: "/shop" },
  order_title: "สั่งซื้อสินค้ากับร้าน",
  order_desc: "เลือกสินค้า ใส่ตะกร้า แล้วยืนยันสั่งซื้อได้จากมือถือ",
  sections: [
    { key: "hero", visible: true },
    { key: "highlights", visible: true },
    { key: "order", visible: true },
    { key: "categories", visible: true },
    { key: "contact", visible: true },
  ],
};

const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.trim().length > 0 ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/** URL ที่ยอมรับสำหรับลิงก์ภายนอก / รูปภาพ */
export function isValidExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** ปลายทางเมนูถูกต้องหรือไม่ (route ต้องมีอยู่จริง) */
export function isValidMenuTarget(item: Pick<SiteMenuItem, "kind" | "to">): boolean {
  if (item.kind === "route") return PUBLIC_ROUTE_OPTIONS.some((r) => r.to === item.to);
  if (item.kind === "anchor") return item.to.startsWith("#") && item.to.length > 1;
  return isValidExternalUrl(item.to);
}

/** ปุ่มพร้อมใช้งานจริงหรือยัง — ปุ่มที่ปลายทางไม่สมบูรณ์จะไม่ถูก render บนหน้า public */
export const isCtaReady = (cta: SiteCta): boolean =>
  cta.enabled && cta.label.trim().length > 0 && isValidMenuTarget(cta);

function normalizeCta(raw: unknown, def: SiteCta): SiteCta {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind: SiteMenuKind = ["route", "anchor", "external"].includes(String(r.kind))
    ? (r.kind as SiteMenuKind)
    : def.kind;
  const cta: SiteCta = {
    enabled: bool(r.enabled, def.enabled),
    label: str(r.label, def.label),
    kind,
    to: str(r.to, def.to),
  };
  // ปลายทางเสีย → กลับไปใช้ route เดิมของระบบ (กันปุ่มตาย)
  return isValidMenuTarget(cta) ? cta : { ...cta, kind: def.kind, to: def.to };
}

/**
 * รวมค่าที่บันทึกไว้เข้ากับค่าเริ่มต้นแบบ fail-safe — ค่าที่หายไป/ผิดชนิด
 * จะกลับไปใช้ค่าเริ่มต้นเสมอ เพื่อไม่ให้หน้า public พัง
 */
export function normalizeSiteConfig(raw: unknown): SiteConfig {
  const d = DEFAULT_SITE_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, any>;

  const highlights: SiteHighlight[] = Array.isArray(r.highlights) && r.highlights.length
    ? d.highlights.map((def, i) => {
        const h = r.highlights[i] ?? {};
        return {
          id: def.id,
          icon: (["shield", "zap", "sparkles"] as const).includes(h?.icon) ? h.icon : def.icon,
          title: str(h?.title, def.title),
          desc: str(h?.desc, def.desc),
          visible: bool(h?.visible, def.visible),
        };
      })
    : d.highlights;

  const menu: SiteMenuItem[] = Array.isArray(r.menu) && r.menu.length
    ? (r.menu as any[])
        .map((m, i) => {
          const def = d.menu.find((x) => x.id === m?.id) ?? d.menu[i] ?? d.menu[0];
          const kind: SiteMenuKind = ["route", "anchor", "external"].includes(m?.kind) ? m.kind : def.kind;
          const to = str(m?.to, def.to);
          const item: SiteMenuItem = {
            id: str(m?.id, def.id),
            label: str(m?.label, def.label),
            kind,
            to,
            visible: bool(m?.visible, def.visible),
          };
          // ปลายทางไม่ถูกต้อง → กลับไปใช้ route เดิม (กันเมนูพัง)
          return isValidMenuTarget(item) ? item : { ...item, kind: def.kind, to: def.to };
        })
        .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
    : d.menu;

  const seen = new Set<string>();
  const sections: SiteSectionPref[] = Array.isArray(r.sections)
    ? (r.sections as any[])
        .filter((s) => s && typeof s.key === "string" && s.key in SECTION_LABELS && !seen.has(s.key) && seen.add(s.key))
        .map((s) => ({ key: s.key as SiteSectionKey, visible: bool(s.visible, true) }))
    : [];
  for (const s of d.sections) if (!seen.has(s.key)) sections.push({ ...s });
  // hero / highlights ต้องอยู่ต้นเสมอ
  sections.sort((a, b) => {
    const ai = LOCKED_SECTIONS.indexOf(a.key);
    const bi = LOCKED_SECTIONS.indexOf(b.key);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const heroUrl = typeof r.hero_image_url === "string" && isValidExternalUrl(r.hero_image_url)
    ? r.hero_image_url
    : null;

  const dashUrl = typeof r.dashboard_image_url === "string" && isValidExternalUrl(r.dashboard_image_url)
    ? r.dashboard_image_url
    : null;

  return {
    brand_label: str(r.brand_label, d.brand_label),
    hero_title_line1: str(r.hero_title_line1, d.hero_title_line1),
    hero_title_line2: str(r.hero_title_line2, d.hero_title_line2),
    hero_desc: str(r.hero_desc, d.hero_desc),
    hours_label: str(r.hours_label, d.hours_label),
    hours_text: str(r.hours_text, d.hours_text),
    hero_image_url: heroUrl,
    hero_image_scale: clampHeroScale(r.hero_image_scale),
    hero_image_scale_mobile: clampHeroScale(r.hero_image_scale_mobile, HERO_SCALE_DEFAULT_MOBILE),
    hero_image_scale_tablet: clampHeroScale(r.hero_image_scale_tablet, HERO_SCALE_DEFAULT_TABLET),
    hero_image_align: toHeroAlign(r.hero_image_align, d.hero_image_align),
    hero_image_align_mobile: toHeroAlign(r.hero_image_align_mobile, toHeroAlign(r.hero_image_align, d.hero_image_align)),
    hero_image_align_tablet: toHeroAlign(r.hero_image_align_tablet, toHeroAlign(r.hero_image_align, d.hero_image_align)),
    dashboard_image_url: dashUrl,
    highlights,
    menu,
    line_cta: {
      enabled: bool(r.line_cta?.enabled, d.line_cta.enabled),
      label: str(r.line_cta?.label, d.line_cta.label),
      url: isValidExternalUrl(String(r.line_cta?.url ?? "")) ? String(r.line_cta.url) : d.line_cta.url,
      note: str(r.line_cta?.note, d.line_cta.note),
    },
    cta_shop: normalizeCta(r.cta_shop, d.cta_shop),
    cta_orders: normalizeCta(r.cta_orders, d.cta_orders),
    cta_requisition: normalizeCta(r.cta_requisition, d.cta_requisition),
    cta_categories: normalizeCta(r.cta_categories, d.cta_categories),
    order_title: str(r.order_title, d.order_title),
    order_desc: str(r.order_desc, d.order_desc),
    sections,
  };
}

export const sectionVisible = (cfg: SiteConfig, key: SiteSectionKey): boolean =>
  cfg.sections.find((s) => s.key === key)?.visible !== false;

/** ลำดับ section ที่ย้ายได้ (ไม่รวม hero/highlights) */
export const movableSections = (cfg: SiteConfig): SiteSectionPref[] =>
  cfg.sections.filter((s) => !LOCKED_SECTIONS.includes(s.key));

export function moveSection(cfg: SiteConfig, key: SiteSectionKey, dir: -1 | 1): SiteConfig {
  const list = [...cfg.sections];
  const i = list.findIndex((s) => s.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return cfg;
  if (LOCKED_SECTIONS.includes(list[i].key) || LOCKED_SECTIONS.includes(list[j].key)) return cfg;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...cfg, sections: list };
}

export function moveMenuItem(cfg: SiteConfig, id: string, dir: -1 | 1): SiteConfig {
  const list = [...cfg.menu];
  const i = list.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return cfg;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...cfg, menu: list };
}
