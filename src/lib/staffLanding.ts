/** Per-device preference: where staff land right after signing in. */
const KEY = "staff.defaultLanding";

export const LANDING_OPTIONS = [
  { value: "auto", label: "อัตโนมัติตามบทบาท" },
  { value: "/admin/home", label: "แดชบอร์ด" },
  { value: "/admin/today", label: "วันนี้" },
  { value: "/pos", label: "POS ขายหน้าร้าน" },
  { value: "/staff/inbox", label: "กล่องงาน" },
] as const;

export type LandingValue = (typeof LANDING_OPTIONS)[number]["value"];

export function getDefaultLanding(): LandingValue {
  try {
    const v = localStorage.getItem(KEY);
    if (v && LANDING_OPTIONS.some((o) => o.value === v)) return v as LandingValue;
  } catch { /* ignore */ }
  return "auto";
}

export function setDefaultLanding(v: LandingValue) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
}

/** Resolve the landing path for a signed-in staff member. */
export function resolveLanding(isAdmin: boolean): string {
  const pref = getDefaultLanding();
  if (pref !== "auto") return pref;
  return isAdmin ? "/admin/home" : "/pos";
}