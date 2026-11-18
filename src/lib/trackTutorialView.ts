/**
 * เก็บสถิติการดูวิดีโอสอน (ไม่ระบุตัวตน) — ห้ามรบกวนผู้ใช้ ห้าม throw
 * หนึ่งเซสชันนับได้หนึ่งครั้งต่อขั้นตอนของแต่ละวิดีโอ (บังคับซ้ำอีกชั้นที่ฐานข้อมูล)
 */
import { supabase } from "@/integrations/supabase/client";

const SID_KEY = "tvw_sid_v1";
const FIRED_KEY = "tvw_fired_v1";

function sessionId(): string {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid =
        (crypto as { randomUUID?: () => string })?.randomUUID?.() ??
        `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return `t_${Date.now()}`;
  }
}

function fired(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function trackTutorialView(videoKey: string, stepKey = "open"): void {
  try {
    const sid = sessionId();
    const k = `${videoKey}:${stepKey}`;
    const seen = fired();
    if (seen.has(k)) return;
    seen.add(k);
    try {
      sessionStorage.setItem(FIRED_KEY, JSON.stringify(Array.from(seen).slice(-200)));
    } catch { /* ignore */ }

    void (supabase as any)
      .from("tutorial_video_views")
      .insert({
        video_key: videoKey,
        step_key: stepKey,
        session_id: sid,
        path: typeof window !== "undefined" ? window.location.pathname : null,
      })
      .then(() => undefined, () => undefined);
  } catch {
    /* เงียบเสมอ */
  }
}

/**
 * เก็บสถิติการ "กดปุ่ม" ของวิดีโอสอน เช่น เล่น แชร์ คัดลอกลิงก์ ดาวน์โหลดซับ
 * ใช้ตารางเดียวกับสถิติการชม โดยใส่คำนำหน้า action: ให้แยกออกจากขั้นตอนในคลิป
 */
export type TutorialAction =
  | "play"
  | "play-landscape"
  | "play-portrait"
  | "download-pdf"
  | "share"
  | "copy"
  | "download-srt"
  | "download-offline"
  | "captions-on"
  | "captions-off";

export function trackTutorialAction(videoKey: string, action: TutorialAction, channel?: string): void {
  trackTutorialView(videoKey, channel ? `action:${action}:${channel}` : `action:${action}`);
}

