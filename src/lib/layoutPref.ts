/**
 * Per-device layout tuning (font scale / content width / density / block order).
 *
 * ค่าถูกเก็บใน localStorage เท่านั้น — แยกตามหน้า (pathname) และมีค่ากลาง
 * (global) เป็นค่าตั้งต้นเมื่อหน้านั้นยังไม่เคยปรับ
 *
 * นำไปใช้ผ่าน CSS variables + data attributes บน <html> (กติกาอยู่ใน index.css)
 * จึงไม่กระทบ business logic ของหน้าใดเลย และถูกตรึงกลับเป็นค่ามาตรฐานตอนพิมพ์
 */

export type UiWidth = "narrow" | "normal" | "wide";
export type UiDensity = "compact" | "normal" | "roomy";

export interface LayoutPref {
  /** 0.8 – 1.5 (คูณกับขนาดตัวอักษรฐาน) */
  fontScale: number;
  width: UiWidth;
  density: UiDensity;
}

export interface LayoutPrefStore {
  global: LayoutPref;
  pages: Record<string, Partial<LayoutPref>>;
  /** ลำดับบล็อกที่ผู้ใช้จัดเอง: `${path}::${stackKey}` → รายการ id */
  order: Record<string, string[]>;
}

export const DEFAULT_LAYOUT_PREF: LayoutPref = {
  fontScale: 1,
  width: "normal",
  density: "normal",
};

export const MIN_FONT_SCALE = 0.8;
export const MAX_FONT_SCALE = 1.5;

const KEY = "ui.layoutPref.v1";

export function clampFontScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, Math.round(v * 100) / 100));
}

/** "/admin/orders/123" → "/admin/orders" (ไม่ให้ค่าแตกตาม id) */
export function normalizePath(pathname: string): string {
  const clean = (pathname || "/").split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "/";
  const isDynamic = (s: string) => /^[0-9a-f]{8}-/i.test(s) || /^\d+$/.test(s);
  return "/" + parts.filter((p) => !isDynamic(p)).join("/");
}

function emptyStore(): LayoutPrefStore {
  return { global: { ...DEFAULT_LAYOUT_PREF }, pages: {}, order: {} };
}

export function readStore(): LayoutPrefStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<LayoutPrefStore>;
    return {
      global: { ...DEFAULT_LAYOUT_PREF, ...(parsed.global ?? {}) },
      pages: parsed.pages ?? {},
      order: parsed.order ?? {},
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: LayoutPrefStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

/** ค่าที่ใช้จริงของหน้านั้น (page override ทับ global) */
export function getLayoutPref(pathname: string, store: LayoutPrefStore = readStore()): LayoutPref {
  const page = store.pages[normalizePath(pathname)] ?? {};
  const merged = { ...DEFAULT_LAYOUT_PREF, ...store.global, ...page };
  return { ...merged, fontScale: clampFontScale(merged.fontScale) };
}

/** true = หน้านี้ถูกปรับแยกจากค่ากลาง */
export function hasPageOverride(pathname: string, store: LayoutPrefStore = readStore()): boolean {
  const p = store.pages[normalizePath(pathname)];
  return !!p && Object.keys(p).length > 0;
}

export function setLayoutPref(pathname: string, patch: Partial<LayoutPref>): LayoutPref {
  const store = readStore();
  const path = normalizePath(pathname);
  const next = { ...getLayoutPref(pathname, store), ...patch };
  next.fontScale = clampFontScale(next.fontScale);
  store.pages[path] = next;
  writeStore(store);
  applyLayoutPref(pathname);
  return next;
}

/** ใช้ค่าปัจจุบันของหน้านี้กับทุกหน้า (ล้าง override รายหน้าอื่นทิ้ง) */
export function applyToAllPages(pathname: string): LayoutPref {
  const store = readStore();
  const current = getLayoutPref(pathname, store);
  store.global = current;
  store.pages = {};
  writeStore(store);
  applyLayoutPref(pathname);
  return current;
}

/** รีเซ็ตหน้านี้กลับค่ามาตรฐาน (ถ้า all = true รีเซ็ตทั้งระบบ) */
export function resetLayoutPref(pathname: string, all = false): LayoutPref {
  const store = readStore();
  if (all) {
    store.global = { ...DEFAULT_LAYOUT_PREF };
    store.pages = {};
    store.order = {};
  } else {
    delete store.pages[normalizePath(pathname)];
  }
  writeStore(store);
  applyLayoutPref(pathname);
  return getLayoutPref(pathname);
}

/** ลำดับบล็อกที่ผู้ใช้จัดเอง — คืน ids เดิมถ้ายังไม่เคยจัด */
export function getBlockOrder(pathname: string, stackKey: string, ids: string[]): string[] {
  const store = readStore();
  const saved = store.order[`${normalizePath(pathname)}::${stackKey}`];
  if (!saved || saved.length === 0) return ids;
  const known = saved.filter((id) => ids.includes(id));
  const added = ids.filter((id) => !known.includes(id));
  return [...known, ...added];
}

export function setBlockOrder(pathname: string, stackKey: string, ids: string[]): void {
  const store = readStore();
  store.order[`${normalizePath(pathname)}::${stackKey}`] = ids;
  writeStore(store);
}

export function clearBlockOrder(pathname: string, stackKey?: string): void {
  const store = readStore();
  const prefix = `${normalizePath(pathname)}::`;
  for (const k of Object.keys(store.order)) {
    if (stackKey ? k === `${prefix}${stackKey}` : k.startsWith(prefix)) delete store.order[k];
  }
  writeStore(store);
}

/** สลับตำแหน่งรายการ (ใช้ทั้งปุ่มขึ้น/ลง และการลาก) */
export function moveInOrder(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const ARRANGE_EVENT = "ui:arrange-mode";
export const LAYOUT_EVENT = "ui:layout-pref";

let arrangeMode = false;
export function isArrangeMode(): boolean { return arrangeMode; }
export function setArrangeMode(on: boolean): void {
  arrangeMode = on;
  try {
    document.documentElement.toggleAttribute("data-ui-arrange", on);
    window.dispatchEvent(new CustomEvent(ARRANGE_EVENT, { detail: on }));
  } catch { /* ignore */ }
}

/** เขียนค่าลง <html> เป็น CSS variables + data attributes */
export function applyLayoutPref(pathname: string = typeof window === "undefined" ? "/" : window.location.pathname): LayoutPref {
  const pref = getLayoutPref(pathname);
  try {
    const root = document.documentElement;
    root.style.setProperty("--ui-font-scale", String(pref.fontScale));
    root.setAttribute("data-ui-width", pref.width);
    root.setAttribute("data-ui-density", pref.density);
    window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: pref }));
  } catch { /* ignore */ }
  return pref;
}
