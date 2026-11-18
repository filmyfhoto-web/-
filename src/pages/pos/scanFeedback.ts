// Small audio + visual feedback for rapid-fire barcode scanning.
// Uses WebAudio (no asset needed). Safe on SSR / no-audio environments.

import { loadScanPrefs } from "./scanPrefs";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, gain = 0.06) {
  const c = ac();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = Math.max(0, Math.min(1, gain));
    o.connect(g).connect(c.destination);
    const t0 = c.currentTime;
    o.start(t0);
    o.stop(t0 + ms / 1000);
  } catch {
    /* noop */
  }
}

/** Read the current volume (0..1). Callers may override. */
function currentVolume(): number {
  try {
    return Math.max(0, Math.min(1, loadScanPrefs().beepVolume));
  } catch {
    return 0.6;
  }
}
function flashOn(): boolean {
  try {
    return loadScanPrefs().flashEnabled;
  } catch {
    return true;
  }
}

export function beepOk() {
  const v = currentVolume();
  if (v <= 0) return;
  tone(1500, 60, 0.12 * v);
}
export function beepFail() {
  const v = currentVolume();
  if (v <= 0) return;
  tone(220, 160, 0.16 * v);
}

/** Flash a green tick briefly at the top of the screen. */
export function flashOk(label: string) {
  if (typeof document === "undefined") return;
  if (!flashOn()) return;
  const el = document.createElement("div");
  el.textContent = `✓ ${label}`;
  el.setAttribute("data-testid", "pos-scan-flash");
  el.style.cssText =
    "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
    "background:hsl(142 72% 35%);color:#fff;padding:6px 14px;border-radius:9999px;" +
    "font-weight:600;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.2);" +
    "pointer-events:none;opacity:0;transition:opacity 120ms ease-out";
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }, 650);
}