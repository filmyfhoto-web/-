/**
 * Display comfort preferences (per device).
 *
 * contrast: "normal" | "high"  — boosts borders/text contrast in the mobile
 *   drawer, tables and muted text for users with low vision.
 * textSize: "normal" | "large" — comfortable reading mode (larger base text
 *   and roomier table rows).
 *
 * Applied as `data-contrast` / `data-text-size` on <html>; the rules live in
 * index.css.
 */
export type ContrastPref = "normal" | "high";
export type TextSizePref = "normal" | "large";

const CONTRAST_KEY = "ui.contrastPref";
const TEXT_KEY = "ui.textSizePref";

export function getContrastPref(): ContrastPref {
  try {
    const v = localStorage.getItem(CONTRAST_KEY);
    if (v === "high" || v === "normal") return v;
  } catch { /* ignore */ }
  return "normal";
}

export function getTextSizePref(): TextSizePref {
  try {
    const v = localStorage.getItem(TEXT_KEY);
    if (v === "large" || v === "normal") return v;
  } catch { /* ignore */ }
  return "normal";
}

export function applyDisplayPrefs(
  contrast: ContrastPref = getContrastPref(),
  textSize: TextSizePref = getTextSizePref(),
): void {
  try {
    const root = document.documentElement;
    if (contrast === "high") root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");
    if (textSize === "large") root.setAttribute("data-text-size", "large");
    else root.removeAttribute("data-text-size");
  } catch { /* ignore */ }
}

export function setContrastPref(v: ContrastPref): void {
  try { localStorage.setItem(CONTRAST_KEY, v); } catch { /* ignore */ }
  applyDisplayPrefs(v, getTextSizePref());
}

export function setTextSizePref(v: TextSizePref): void {
  try { localStorage.setItem(TEXT_KEY, v); } catch { /* ignore */ }
  applyDisplayPrefs(getContrastPref(), v);
}
