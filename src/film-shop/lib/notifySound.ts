/** เสียงแจ้งเตือนข้อความใหม่ (Web Audio API — ไม่ต้องโหลดไฟล์เสียง) */
import { getGroupSound, type AlertGroup } from './alertSoundSettings';
import { logFsActivity } from './fsActivityLog';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** เรียกครั้งแรกตอนผู้ใช้แตะหน้าจอ เพื่อปลดล็อกเสียงบนมือถือ/Safari */
export function primeNotificationSound() {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

/** กริ๊งสั้น ๆ สไตล์แอปแชท */
export function playNotificationSound() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, c.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.3);
  } catch {
    /* เสียงถูกบล็อก — ข้ามไป */
  }
}

/** โทนสั้น ๆ ตามความถี่ที่กำหนด (ใช้แยกเสียงกลุ่มแจ้งเตือน) */
export function playTone(frequency: number, durationMs = 180, volume = 0.09) {
  try {
    const c = getCtx();
    if (!c) return;
    if (volume <= 0) return;
    if (c.state === 'suspended') void c.resume();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, c.currentTime);
    gain.gain.setValueAtTime(Math.min(0.4, Math.max(0.001, volume)), c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + durationMs / 1000);
  } catch {
    /* เสียงถูกบล็อก — ข้ามไป */
  }
}

/** เล่นเสียงแจ้งเตือนตามกลุ่ม โดยใช้ค่าที่ผู้ใช้ตั้งไว้ในหน้าตั้งค่า */
export function playGroupAlert(group: AlertGroup) {
  const cfg = getGroupSound(group);
  logFsActivity('notification', group === 1 ? 'แจ้งเตือนกลุ่ม 1 (เว็บแอป)' : 'แจ้งเตือนกลุ่ม 2 (NATTA.Q)', {
    group,
    enabled: cfg.enabled,
    frequency: cfg.frequency,
    volume: Math.round(cfg.volume * 100) + '%',
  });
  if (!cfg.enabled) return;
  playTone(cfg.frequency, cfg.durationMs, cfg.volume * 0.3);
}
