/**
 * พิมพ์เอกสารโดยไม่เปิดแท็บ `about:blank`
 *
 * เดิมทุกจุดพิมพ์ใช้ `window.open("", "_blank")` แล้วค่อย `document.write`
 * ซึ่งบน iOS Safari / PWA ที่ติดตั้งบนหน้าจอโฮม และในเบราว์เซอร์ในแอป (LINE)
 * จะได้แท็บว่างที่ขึ้นว่า "ไม่แสดงหน้านี้" (about:blank) แทนเอกสาร
 *
 * `openPrintSurface()` คืนค่า Window ของ iframe ซ่อน ซึ่งใช้งาน API ชุดเดิมได้
 * (`document.open/write/close`, `onload`, `print()`, `close()`) จึงแทนที่
 * `window.open("", "_blank")` ได้ตรง ๆ โดยไม่ต้องแก้โค้ดสร้าง HTML
 */

/** true เมื่ออยู่ในบริบทที่ป๊อปอัปมักกลายเป็นหน้า about:blank ว่าง ๆ */
export function prefersInlinePrint(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const inApp = /Line\/|FBAN|FBAV|Instagram/.test(ua);
  return standalone || iOS || inApp;
}

export function openPrintSurface(): Window | null {
  if (typeof document === "undefined") return null;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "พิมพ์เอกสาร";
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return null;
  }

  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    window.setTimeout(() => frame.remove(), 300);
  };
  try {
    Object.defineProperty(win, "close", { configurable: true, value: cleanup });
  } catch {
    /* ignore — the safety timer below still removes the frame */
  }

  // ผู้เรียกหลายจุดตั้ง `w.onload` หลังจาก document.close() ไปแล้ว
  // ซึ่งใน iframe อาจพลาด event จริง จึงจำลอง onload ให้ยิงแน่นอนหนึ่งครั้ง
  let handler: ((ev: Event) => unknown) | null = null;
  let fired = false;
  const fire = () => {
    if (fired || !handler) return;
    fired = true;
    try { handler.call(win, new Event("load")); } catch { /* ignore */ }
  };
  frame.addEventListener("load", () => window.setTimeout(fire, 120));
  try {
    Object.defineProperty(win, "onload", {
      configurable: true,
      get: () => handler,
      set: (fn: ((ev: Event) => unknown) | null) => {
        handler = fn;
        window.setTimeout(fire, 200);
      },
    });
  } catch {
    /* ignore */
  }

  win.addEventListener("afterprint", () => cleanup());
  // กันหลุด: ถ้าไม่มีใครสั่งปิด ให้เก็บกวาดเอง
  window.setTimeout(cleanup, 120_000);
  return win;
}

/** เปิดหน้าต่างพิมพ์: ใช้ป๊อปอัปบนเดสก์ท็อป และ iframe เมื่อป๊อปอัปใช้ไม่ได้ */
export function openPrintWindowOrSurface(features = "width=900,height=1100"): Window | null {
  if (prefersInlinePrint()) return openPrintSurface();
  let popup: Window | null = null;
  try { popup = window.open("", "_blank", features); } catch { popup = null; }
  return popup ?? openPrintSurface();
}

/**
 * `<head>` ของเอกสารพิมพ์: ฟอนต์ไทยต้องไม่พึ่ง Google Fonts อย่างเดียว —
 * ถ้าโหลดไม่ทัน/ออฟไลน์ ยังตกไปที่ฟอนต์ไทยของเครื่องแทนที่จะเป็นกล่องสี่เหลี่ยม
 */
export const PRINT_FONT_STACK =
  `'Sarabun', 'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', 'Tahoma', system-ui, sans-serif`;

export const PRINT_FONT_HEAD = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>body, .print-container { font-family: ${PRINT_FONT_STACK}; }</style>
`;

/**
 * รอให้ฟอนต์ (โดยเฉพาะฟอนต์ไทย) พร้อมก่อนสั่งพิมพ์ ไม่งั้นบางเครื่องจะพิมพ์
 * ด้วย fallback ที่ตัดสระ/วรรณยุกต์เพี้ยน. มี timeout กันค้างเสมอ และคง
 * พฤติกรรมเดิมของ iOS/PWA/LINE iframe (ผู้เรียกยังใช้ window เดิมทุกอย่าง)
 */
export async function printWhenFontsReady(
  targetWindow: Window | null | undefined,
  timeoutMs = 1500,
): Promise<void> {
  if (!targetWindow) return;
  try {
    const fonts = (targetWindow.document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    const ready = fonts?.ready;
    if (ready && typeof (ready as Promise<unknown>).then === "function") {
      await Promise.race([
        (ready as Promise<unknown>).then(() => undefined).catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    }
  } catch {
    /* cross-origin หรือเบราว์เซอร์เก่า — พิมพ์ต่อได้เลย */
  }
  try {
    targetWindow.focus();
    targetWindow.print();
  } catch {
    /* ignore — ผู้ใช้ปิดหน้าต่างไปแล้ว */
  }
}
