/**
 * จำว่าลูกค้าดูวิดีโอสอนถึงขั้นตอนไหนแล้ว (เก็บในเครื่องผู้ใช้ ไม่ระบุตัวตน)
 */
const KEY = "tutorial_progress_v1";

export type TutorialProgress = Record<string, string[]>;

export function readTutorialProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? (obj as TutorialProgress) : {};
  } catch {
    return {};
  }
}

/** บันทึกว่าดูขั้นตอนนี้แล้ว — คืนค่าสถานะล่าสุดเสมอ */
export function markTutorialStep(videoKey: string, stepKey: string): TutorialProgress {
  const all = readTutorialProgress();
  const done = new Set(all[videoKey] ?? []);
  if (done.has(stepKey)) return all;
  done.add(stepKey);
  const next = { ...all, [videoKey]: Array.from(done) };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}

export function clearTutorialProgress(videoKey?: string): TutorialProgress {
  const next = videoKey ? { ...readTutorialProgress(), [videoKey]: [] } : {};
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return next;
}
