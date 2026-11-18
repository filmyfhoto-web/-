/** ตั้งค่าโทนเสียง/ระดับเสียงแจ้งเตือน แยกตามกลุ่ม 1 (เว็บแอป) และกลุ่ม 2 (NATTA.Q AI) */
export type AlertGroup = 1 | 2;

export type GroupSoundConfig = {
  enabled: boolean;
  /** ความถี่โทนเสียง (Hz) */
  frequency: number;
  /** ระดับเสียง 0–1 */
  volume: number;
  /** ความยาวเสียง (ms) */
  durationMs: number;
};

export type AlertSoundSettings = Record<'g1' | 'g2', GroupSoundConfig>;

export const ALERT_SOUND_STORAGE_KEY = 'fs.alertSound.v1';

export const DEFAULT_ALERT_SOUND_SETTINGS: AlertSoundSettings = {
  g1: { enabled: true, frequency: 600, volume: 0.35, durationMs: 180 },
  g2: { enabled: true, frequency: 900, volume: 0.35, durationMs: 180 },
};

/** โทนเสียงสำเร็จรูปให้เลือก */
export const TONE_PRESETS: { label: string; frequency: number }[] = [
  { label: 'ทุ้มลึก (440Hz)', frequency: 440 },
  { label: 'ทุ้ม (600Hz)', frequency: 600 },
  { label: 'กลาง (750Hz)', frequency: 750 },
  { label: 'แหลม (900Hz)', frequency: 900 },
  { label: 'แหลมสูง (1200Hz)', frequency: 1200 },
];

function clampConfig(raw: unknown, fallback: GroupSoundConfig): GroupSoundConfig {
  const o = (raw ?? {}) as Partial<GroupSoundConfig>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, n));
  };
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : fallback.enabled,
    frequency: num(o.frequency, fallback.frequency, 200, 2000),
    volume: num(o.volume, fallback.volume, 0, 1),
    durationMs: num(o.durationMs, fallback.durationMs, 60, 1500),
  };
}

export function normalizeAlertSoundSettings(raw: unknown): AlertSoundSettings {
  const o = (raw ?? {}) as Partial<AlertSoundSettings>;
  return {
    g1: clampConfig(o.g1, DEFAULT_ALERT_SOUND_SETTINGS.g1),
    g2: clampConfig(o.g2, DEFAULT_ALERT_SOUND_SETTINGS.g2),
  };
}

export function loadAlertSoundSettings(): AlertSoundSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_ALERT_SOUND_SETTINGS;
  try {
    const raw = localStorage.getItem(ALERT_SOUND_STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_SOUND_SETTINGS;
    return normalizeAlertSoundSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_ALERT_SOUND_SETTINGS;
  }
}

export function saveAlertSoundSettings(settings: AlertSoundSettings) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ALERT_SOUND_STORAGE_KEY, JSON.stringify(normalizeAlertSoundSettings(settings)));
    window.dispatchEvent(new CustomEvent('fs-alert-sound-changed'));
  } catch {
    /* โควตาเต็ม — ข้ามไป */
  }
}

export function getGroupSound(group: AlertGroup): GroupSoundConfig {
  const s = loadAlertSoundSettings();
  return group === 1 ? s.g1 : s.g2;
}
