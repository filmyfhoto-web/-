/**
 * แชร์วิดีโอสอน — เลือกช่องทาง/อุปกรณ์ได้ และแนบพารามิเตอร์ UTM
 * ให้ทุกลิงก์ที่แชร์ออกไป วัดผลย้อนหลังได้ว่ามาจากช่องทางไหน
 */
import { tutorialShareUrl } from "@/lib/tutorialVideos";

export type ShareChannelId = "device" | "line" | "facebook" | "x" | "copy" | "qr";

export interface ShareChannel {
  id: ShareChannelId;
  label: string;
  /** ค่า utm_source ที่จะแนบไปกับลิงก์ */
  source: string;
  /** ปลายทางเว็บของช่องทางนั้น (ถ้ามี) */
  web?: (url: string, text: string) => string;
}

export const TUTORIAL_SHARE_CHANNELS: ShareChannel[] = [
  { id: "device", label: "แชร์ด้วยแอปในเครื่อง", source: "device" },
  {
    id: "line",
    label: "ส่งทาง LINE",
    source: "line",
    web: (url, text) => `https://line.me/R/msg/text/?${encodeURIComponent(`${text}\n${url}`)}`,
  },
  {
    id: "facebook",
    label: "แชร์ลง Facebook",
    source: "facebook",
    web: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: "x",
    label: "แชร์ลง X (Twitter)",
    source: "x",
    web: (url, text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  { id: "copy", label: "คัดลอกลิงก์", source: "copy" },
];

export interface UtmParams {
  source: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

/** แนบ utm_* ให้ URL โดยไม่ทับพารามิเตอร์เดิม และคง hash เดิมไว้ */
export function withUtm(rawUrl: string, utm: UtmParams): string {
  const base = typeof window !== "undefined" ? window.location.origin : "https://www.filmyynatta.com";
  const u = new URL(rawUrl, base);
  u.searchParams.set("utm_source", utm.source);
  u.searchParams.set("utm_medium", utm.medium ?? "share");
  if (utm.campaign) u.searchParams.set("utm_campaign", utm.campaign);
  if (utm.content) u.searchParams.set("utm_content", utm.content);
  return rawUrl.startsWith("http") || typeof window !== "undefined" ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
}

/** ลิงก์แชร์ของวิดีโอหนึ่งตอน พร้อม UTM ของช่องทางที่เลือก */
export function tutorialShareLink(videoKey: string, channel: ShareChannel, at?: number): string {
  return withUtm(tutorialShareUrl(videoKey, at), {
    source: channel.source,
    medium: "share",
    campaign: "tutorial",
    content: videoKey,
  });
}
