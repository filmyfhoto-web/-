/**
 * วิดีโอสอนใช้งานสำหรับลูกค้า (แสดงบนหน้าแรก)
 * chapters = จุดเวลาในคลิป ใช้กับปุ่มลัดใต้คลิปเพื่อกระโดดไปยังขั้นตอนนั้น
 * script   = สคริปต์คำแนะนำสั้น ๆ ที่เลื่อนตามเวลาเล่นจริงใต้คลิป
 */
import shopVideo from "@/assets/how-to-shop-th.mp4.asset.json";
import trackVideo from "@/assets/how-to-track-th.mp4.asset.json";

export interface TutorialChapter {
  /** คีย์สำหรับเก็บสถิติ/สถานะการดู */
  key: string;
  label: string;
  /** วินาทีที่เริ่มขั้นตอนนี้ */
  at: number;
  /** วินาทีที่จบขั้นตอนนี้ */
  end: number;
  hint: string;
  /** ปุ่มจริงบนหน้าจอที่ต้องกดในขั้นตอนนี้ */
  button?: string;
}

export interface TutorialVideo {
  key: string;
  title: string;
  desc: string;
  src: string;
  /** ไฟล์ซับไตเติลภาษาไทย */
  vtt: string;
  /** ไฟล์ซับไตเติลภาษาไทยสำหรับดาวน์โหลด (SRT) */
  srt: string;
  duration: number;
  chapters: TutorialChapter[];
  script: { at: number; text: string }[];
}

/** ลิงก์ลึกไปยังขั้นตอนหนึ่งของวิดีโอบนหน้าแรก */
export function tutorialDeepLink(videoKey: string, at?: number): string {
  const t = at != null ? `&t=${Math.max(0, Math.round(at * 10) / 10)}` : "";
  return `/?tutorial=${videoKey}${t}#tutorial`;
}

/** URL เต็มสำหรับแชร์ให้ลูกค้า */
export function tutorialShareUrl(videoKey?: string, at?: number): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.filmyynatta.com";
  return `${origin}${videoKey ? tutorialDeepLink(videoKey, at) : "/#tutorial"}`;
}

export const TUTORIAL_VIDEOS: TutorialVideo[] = [
  {
    key: "how-to-shop",
    title: "ตอนที่ 1 · เริ่มสั่งซื้อสินค้า",
    desc: "เปิดหน้าแรก เลือกหมวดสินค้า แล้วใส่ตะกร้า — ใช้เวลาไม่ถึง 1 นาที",
    src: shopVideo.url,
    vtt: "/tutorials/how-to-shop-th.vtt",
    srt: "/tutorials/how-to-shop-th.srt",
    duration: 24.3,
    chapters: [
      { key: "intro", label: "เริ่มต้น", at: 0, end: 4.7, hint: "ดูภาพรวมทั้ง 3 ขั้นตอน" },
      { key: "open-home", label: "1. เปิดหน้าแรก", at: 4.7, end: 10.6, hint: "พิมพ์ www.filmyynatta.com หรือแตะลิงก์จาก LINE", button: "หน้าแรก" },
      { key: "pick-product", label: "2. เลือกสินค้า", at: 10.6, end: 16.8, hint: "แตะแท็บ “สินค้า” แล้วเลือกหมวดที่ต้องการ", button: "แท็บ สินค้า" },
      { key: "add-cart", label: "3. ใส่ตะกร้า", at: 16.8, end: 24.3, hint: "กด “เพิ่มลงตะกร้า” แล้วกด “ตรวจสอบก่อนสั่ง”", button: "เพิ่มลงตะกร้า" },
    ],
    script: [
      { at: 0, text: "เริ่มจากเปิดเว็บไซต์ของร้าน ไม่ต้องล็อกอินก็ดูสินค้าได้" },
      { at: 4.7, text: "พิมพ์ www.filmyynatta.com หรือแตะลิงก์ที่ร้านส่งให้ทาง LINE" },
      { at: 10.6, text: "แตะแท็บ “สินค้า” ด้านล่างจอ แล้วเลือกหมวดที่ต้องการ" },
      { at: 14.5, text: "ค้นหาชื่อสินค้าได้จากช่องค้นหาด้านบน" },
      { at: 16.8, text: "กด “เพิ่มลงตะกร้า” แล้วเปิดตะกร้าเพื่อตรวจรายการ" },
      { at: 21, text: "กด “ดำเนินการสั่งซื้อ” ยืนยันด้วย LINE แล้วรอร้านแจ้งสถานะ" },
    ],
  },
  {
    key: "how-to-track",
    title: "ตอนที่ 2 · ตะกร้า ส่งคำขอราคา และติดตามงาน",
    desc: "แก้จำนวนสินค้า ส่งคำขอราคาให้ร้าน แล้วดูสถานะได้ที่ “งานของฉัน”",
    src: trackVideo.url,
    vtt: "/tutorials/how-to-track-th.vtt",
    srt: "/tutorials/how-to-track-th.srt",
    duration: 29.7,
    chapters: [
      { key: "intro", label: "เริ่มต้น", at: 0, end: 4.7, hint: "ภาพรวมหลังจากมีสินค้าในตะกร้า" },
      { key: "qty", label: "1. แก้จำนวน", at: 4.7, end: 10.9, hint: "กด + / − หรือถังขยะเพื่อลบรายการ", button: "+ / −" },
      { key: "request", label: "2. ส่งคำขอราคา", at: 10.9, end: 17.1, hint: "ติ๊กเลือกรายการ แล้วกด “ตรวจสอบก่อนสั่ง”", button: "ตรวจสอบก่อนสั่ง" },
      { key: "line", label: "3. ยืนยันด้วย LINE", at: 17.1, end: 23.1, hint: "กดปุ่มสีเขียวเพื่อยืนยันตัวตนครั้งเดียว", button: "เข้าสู่ระบบด้วย LINE" },
      { key: "track", label: "4. ติดตามสถานะ", at: 23.1, end: 29.7, hint: "ดูความคืบหน้าที่แท็บ “งานของฉัน”", button: "แท็บ งานของฉัน" },
    ],
    script: [
      { at: 0, text: "เมื่อมีสินค้าในตะกร้าแล้ว มาดู 4 ขั้นตอนถัดไป" },
      { at: 4.7, text: "กด + หรือ − เพื่อแก้จำนวน กดถังขยะเพื่อลบรายการที่ไม่ต้องการ" },
      { at: 10.9, text: "ติ๊กเลือกรายการ แล้วกด “ตรวจสอบก่อนสั่ง” เพื่อส่งคำขอราคา" },
      { at: 17.1, text: "กดปุ่มสีเขียวยืนยันตัวตนด้วย LINE ทำครั้งเดียวพอ" },
      { at: 23.1, text: "เปิดแท็บ “งานของฉัน” เพื่อดูสถานะและการแจ้งเตือนจากร้าน" },
    ],
  },
];

