/**
 * เก็บวิดีโอสอน + ไฟล์คำบรรยายไว้ในเครื่อง (Cache Storage ของ PWA)
 * เพื่อให้เปิดดูได้แม้อยู่นอกพื้นที่สัญญาณ — ล้มเหลวได้เงียบ ๆ เสมอ
 */
import type { TutorialVideo } from "@/lib/tutorialVideos";

export const TUTORIAL_CACHE = "tutorial-media";

export function tutorialMediaUrls(video: TutorialVideo): string[] {
  return [video.src, video.vtt, video.srt];
}

function cacheApi(): CacheStorage | null {
  if (typeof caches === "undefined") return null;
  return caches;
}

/** ดาวน์โหลดไฟล์ของตอนนี้เก็บไว้ดูออฟไลน์ */
export async function cacheTutorialMedia(video: TutorialVideo): Promise<boolean> {
  const api = cacheApi();
  if (!api) return false;
  try {
    const cache = await api.open(TUTORIAL_CACHE);
    await Promise.all(
      tutorialMediaUrls(video).map(async (url) => {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res.clone());
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** ตอนนี้ถูกเก็บไว้ในเครื่องครบแล้วหรือยัง */
export async function isTutorialCached(video: TutorialVideo): Promise<boolean> {
  const api = cacheApi();
  if (!api) return false;
  try {
    const cache = await api.open(TUTORIAL_CACHE);
    const hits = await Promise.all(tutorialMediaUrls(video).map((u) => cache.match(u)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

/** ลบไฟล์ออฟไลน์ของตอนนี้ */
export async function clearTutorialCache(video: TutorialVideo): Promise<void> {
  const api = cacheApi();
  if (!api) return;
  try {
    const cache = await api.open(TUTORIAL_CACHE);
    await Promise.all(tutorialMediaUrls(video).map((u) => cache.delete(u)));
  } catch {
    /* เงียบ */
  }
}
