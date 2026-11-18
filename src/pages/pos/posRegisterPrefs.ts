/**
 * Per-device register identity for the touch POS: which shop/branch and which
 * physical till this browser is. Stored locally (the sale itself is still
 * committed by `pos_checkout` server-side).
 */
export type PosRegisterPrefs = {
  storeKey: string;
  registerKey: string;
};

/**
 * The real shops of this business (mirrors `rds_stores`). No invented
 * branches: Nattaworks was retired, so only these two remain sellable.
 * The chosen key is committed with the sale as `pos_checkout(p_branch)`.
 */
export const POS_STORES: { key: string; label: string }[] = [
  { key: "colorlab", label: "ร้านนัฐภรณ์ คัลเลอร์แล็ป" },
  { key: "printing", label: "ร้านนัฐภรณ์ การพิมพ์" },
];

export const POS_REGISTERS: { key: string; label: string }[] = [
  { key: "pos1", label: "เครื่อง POS 1" },
  { key: "pos2", label: "เครื่อง POS 2" },
  { key: "pos3", label: "เครื่อง POS 3" },
];

const KEY = "pos.register.v1";

export const DEFAULT_REGISTER_PREFS: PosRegisterPrefs = { storeKey: "colorlab", registerKey: "pos1" };

/** Old builds stored invented branch keys — map them onto the real shops. */
const LEGACY_STORE_KEYS: Record<string, string> = {
  main: "colorlab",
  branch2: "printing",
  branch3: "colorlab",
};

export function loadRegisterPrefs(): PosRegisterPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_REGISTER_PREFS };
    const p = JSON.parse(raw) as Partial<PosRegisterPrefs>;
    const migrated = p.storeKey && LEGACY_STORE_KEYS[p.storeKey] ? LEGACY_STORE_KEYS[p.storeKey] : p.storeKey;
    return {
      storeKey: POS_STORES.some((s) => s.key === migrated) ? migrated! : DEFAULT_REGISTER_PREFS.storeKey,
      registerKey: POS_REGISTERS.some((s) => s.key === p.registerKey) ? p.registerKey! : DEFAULT_REGISTER_PREFS.registerKey,
    };
  } catch {
    return { ...DEFAULT_REGISTER_PREFS };
  }
}

export function saveRegisterPrefs(p: PosRegisterPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function storeLabel(key: string): string {
  return POS_STORES.find((s) => s.key === key)?.label ?? POS_STORES[0].label;
}
export function registerLabel(key: string): string {
  return POS_REGISTERS.find((s) => s.key === key)?.label ?? POS_REGISTERS[0].label;
}

/**
 * "จอสัมผัส" (touch) mode — per device. When on, the register enlarges every
 * tap target and loosens spacing for counter-top touchscreens.
 */
const TOUCH_KEY = "pos.touchmode.v1";

export function loadTouchMode(): boolean {
  try { return localStorage.getItem(TOUCH_KEY) === "1"; } catch { return false; }
}

export function saveTouchMode(on: boolean): void {
  try { localStorage.setItem(TOUCH_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
