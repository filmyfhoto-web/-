/**
 * เกราะป้องกันรันไทม์สำหรับมือถือ (iOS Safari, in-app browser ของ LINE/Facebook)
 *
 * เบราว์เซอร์เหล่านี้อาจ:
 *  - โยน error ทันทีที่แตะ `localStorage` / `sessionStorage` (โหมดส่วนตัว, บล็อกคุกกี้)
 *    ทำให้แอปดับตั้งแต่บูตหรือค้างหน้าโหลด
 *  - ไม่มี `navigator.clipboard` เมื่อไม่ใช่ secure context → ปุ่ม "คัดลอก" ทำแอปพัง
 *
 * โมดูลนี้ต้องถูก import เป็นอันดับแรกใน main.tsx ก่อน supabase client
 * เพราะ supabase-js อ่าน localStorage ตอนสร้าง client
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
  } as Storage;
}

function storageWorks(kind: "localStorage" | "sessionStorage"): boolean {
  try {
    const s = window[kind];
    const probe = "__rds_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function patchStorage(kind: "localStorage" | "sessionStorage") {
  if (storageWorks(kind)) return;
  try {
    Object.defineProperty(window, kind, {
      value: memoryStorage(),
      configurable: true,
      writable: false,
    });
  } catch {
    /* ถ้าเขียนทับไม่ได้จริง ๆ ก็ปล่อยไป — จุดเรียกใช้ทุกที่หุ้ม try/catch อยู่แล้ว */
  }
}

/** สำรองการคัดลอกด้วย textarea เมื่อไม่มี Clipboard API (http / in-app browser) */
function patchClipboard() {
  const nav = navigator as Navigator & { clipboard?: Clipboard };
  const legacyCopy = (text: string): Promise<void> => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      document.execCommand("copy");
      ta.remove();
      return Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  };
  if (!nav.clipboard) {
    try {
      Object.defineProperty(nav, "clipboard", {
        value: { writeText: legacyCopy, readText: () => Promise.resolve("") },
        configurable: true,
      });
    } catch { /* ignore */ }
    return;
  }
  // มี clipboard แต่ writeText อาจ reject (ไม่ได้ user gesture / permission)
  const original = nav.clipboard.writeText?.bind(nav.clipboard);
  if (!original) return;
  try {
    nav.clipboard.writeText = (text: string) => original(text).catch(() => legacyCopy(text));
  } catch { /* clipboard เป็น read-only ในบางเบราว์เซอร์ */ }
}

let installed = false;

/** ติดตั้งเกราะทั้งหมด — เรียกครั้งเดียวก่อน render */
export function installMobileRuntimeGuards() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  patchStorage("localStorage");
  patchStorage("sessionStorage");
  try { patchClipboard(); } catch { /* ignore */ }
}

// ติดตั้งทันทีตอน import (ESM hoist import ทั้งหมดก่อนโค้ดบรรทัดแรกเสมอ
// การเรียกฟังก์ชันใน main.tsx จึงช้าเกินไปสำหรับ supabase client)
installMobileRuntimeGuards();
