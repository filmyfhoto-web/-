/**
 * Per-device admin preferences for new-order alerts.
 *
 * Stored in localStorage so each admin workstation can decide whether it
 * pops a toast and beeps.
 *
 * These are PRESENTATION-only preferences. LINE delivery is decided and
 * performed entirely server-side by the notification outbox worker, so there
 * is deliberately no "resend from this browser" switch here — a per-device
 * sender produced duplicate messages whenever two admins had the page open.
 *
 * The sound flag deliberately reuses the legacy key `admin.orderAlerts.sound`
 * so the toggle button on /admin/order-alerts stays in sync.
 */
export const SOUND_KEY = "admin.orderAlerts.sound";
const TOAST_KEY = "admin.orderAlerts.toast";

/** Keys written by the removed client-side auto-resend feature. */
const LEGACY_KEYS = [
  "admin.orderAlerts.autoResend",
  "admin.orderAlerts.autoResendMax",
  "admin.orderAlerts.autoResendIntervalSec",
];

export interface OrderAlertPrefs {
  toast: boolean;
  sound: boolean;
}

export const DEFAULT_ORDER_ALERT_PREFS: OrderAlertPrefs = {
  toast: true,
  sound: true,
};

/**
 * Drop settings left behind by the removed browser-side resend scheduler so a
 * long-lived admin workstation can't keep a stale toggle around.
 */
export function purgeLegacyOrderAlertPrefs(): void {
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v !== "off";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, on: boolean) {
  try { localStorage.setItem(key, on ? "on" : "off"); } catch { /* ignore */ }
}

export function readOrderAlertPrefs(): OrderAlertPrefs {
  return {
    toast: readBool(TOAST_KEY, DEFAULT_ORDER_ALERT_PREFS.toast),
    sound: readBool(SOUND_KEY, DEFAULT_ORDER_ALERT_PREFS.sound),
  };
}

export function writeOrderAlertPrefs(p: Partial<OrderAlertPrefs>): OrderAlertPrefs {
  if (p.toast !== undefined) writeBool(TOAST_KEY, p.toast);
  if (p.sound !== undefined) writeBool(SOUND_KEY, p.sound);
  return readOrderAlertPrefs();
}