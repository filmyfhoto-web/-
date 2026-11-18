import Welcome from "./Welcome";

/**
 * ตรวจว่าเปิดจากเบราว์เซอร์ในแอป LINE หรือไม่ (เก็บไว้ให้ส่วนอื่นใช้)
 * — ไม่ใช้ตัดสินใจเด้งหน้าอีกต่อไป
 */
export function isLineInAppBrowser(ua: string): boolean {
  return / Line\//i.test(ua) || /\bLIFF\b/i.test(ua);
}

/**
 * `/` เป็นหน้าเว็บไซต์ของร้านสำหรับทุกคน ไม่มีการปรับเส้นทางไป LINE/LIFF
 * โดยอัตโนมัติอีกต่อไป (เข้าหน้า LINE ได้จากลิงก์/ปุ่มที่ผู้ใช้กดเองเท่านั้น)
 */
export default function Index() {
  return <Welcome />;
}

