/**
 * Reduced-motion preference (per device).
 *
 * "auto"    — follow the OS `prefers-reduced-motion` setting
 * "reduced" — always minimise animations/transitions
 * "full"    — always keep animations
 *
 * When reduction is active we set `data-reduce-motion="1"` on <html>; the CSS
 * in index.css disables transitions/animations, which removes the flicker and
 * colour-shift artefacts on devices that repaint slowly during state changes.
 */
export type MotionPref = "auto" | "reduced" | "full";

const KEY = "ui.motionPref";

export function getMotionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "auto" || v === "reduced" || v === "full") return v;
  } catch { /* ignore */ }
  return "auto";
}

export function prefersReducedMotionOS(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { return false; }
}

export function isMotionReduced(pref: MotionPref = getMotionPref()): boolean {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return prefersReducedMotionOS();
}

export function applyMotionPref(pref: MotionPref = getMotionPref()): void {
  try {
    const root = document.documentElement;
    if (isMotionReduced(pref)) root.setAttribute("data-reduce-motion", "1");
    else root.removeAttribute("data-reduce-motion");
  } catch { /* ignore */ }
}

export function setMotionPref(pref: MotionPref): void {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyMotionPref(pref);
}

/** Keep "auto" in sync when the OS setting changes. Returns an unsubscribe fn. */
export function watchMotionPref(): () => void {
  try {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => applyMotionPref();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  } catch { return () => {}; }
}
