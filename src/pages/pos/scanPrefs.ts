// Persistent scanner preferences shared across POS scan surfaces.
// Stored in localStorage under a single key for simplicity.

export type DeviceProfile = "auto" | "usb-wedge" | "camera" | "mobile-app";

export type ScanPrefs = {
  rapidScanEnabled: boolean;
  continuousCamera: boolean;
  beepVolume: number; // 0..1
  flashEnabled: boolean;
  deviceProfile: DeviceProfile;
};

export const DEFAULT_SCAN_PREFS: ScanPrefs = {
  rapidScanEnabled: true,
  continuousCamera: true,
  beepVolume: 0.6,
  flashEnabled: true,
  deviceProfile: "auto",
};

const KEY = "pos.scanPrefs.v1";

export function loadScanPrefs(): ScanPrefs {
  if (typeof window === "undefined") return DEFAULT_SCAN_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return migrateLegacy();
    return { ...DEFAULT_SCAN_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SCAN_PREFS;
  }
}

export function saveScanPrefs(prefs: ScanPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}

/** Convert profile → rapid-scanner thresholds. */
export function profileTimings(p: DeviceProfile): { minLen: number; maxInterval: number } {
  switch (p) {
    case "usb-wedge":
      return { minLen: 3, maxInterval: 30 };
    case "mobile-app":
      return { minLen: 3, maxInterval: 80 };
    case "camera":
      // Camera profile disables keyboard-wedge detection entirely.
      return { minLen: 999, maxInterval: 1 };
    case "auto":
    default:
      return { minLen: 3, maxInterval: 40 };
  }
}

function migrateLegacy(): ScanPrefs {
  const prefs = { ...DEFAULT_SCAN_PREFS };
  try {
    const rapid = window.localStorage.getItem("pos_rapid_scan");
    if (rapid !== null) prefs.rapidScanEnabled = rapid !== "0";
    const cont = window.localStorage.getItem("pos_scan_continuous");
    if (cont !== null) prefs.continuousCamera = cont !== "0";
  } catch {
    /* noop */
  }
  return prefs;
}