import { describe, it, expect, vi } from "vitest";
import { printWhenFontsReady, PRINT_FONT_HEAD, PRINT_FONT_STACK } from "@/lib/printSurface";

function fakeWindow(fontsReady?: Promise<unknown> | null) {
  const print = vi.fn();
  const focus = vi.fn();
  return {
    win: { document: { fonts: fontsReady ? { ready: fontsReady } : undefined }, print, focus } as unknown as Window,
    print,
    focus,
  };
}

describe("printWhenFontsReady", () => {
  it("รอ fonts.ready แล้วสั่งพิมพ์ครั้งเดียว", async () => {
    const { win, print, focus } = fakeWindow(Promise.resolve());
    await printWhenFontsReady(win, 1000);
    expect(print).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("ฟอนต์โหลดไม่เสร็จ → timeout แล้วยังพิมพ์ (ไม่ค้าง ไม่ throw)", async () => {
    const { win, print } = fakeWindow(new Promise(() => {}));
    await expect(printWhenFontsReady(win, 10)).resolves.toBeUndefined();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("fonts.ready reject ก็ยังพิมพ์", async () => {
    const { win, print } = fakeWindow(Promise.reject(new Error("boom")));
    await expect(printWhenFontsReady(win, 50)).resolves.toBeUndefined();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("เบราว์เซอร์ไม่มี document.fonts ก็พิมพ์ทันที", async () => {
    const { win, print } = fakeWindow(null);
    await printWhenFontsReady(win, 50);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("window เป็น null = ไม่พัง", async () => {
    await expect(printWhenFontsReady(null)).resolves.toBeUndefined();
  });

  it("print() throw (ผู้ใช้ปิดหน้าต่าง) ไม่ทำให้ล้ม", async () => {
    const win = {
      document: { fonts: { ready: Promise.resolve() } },
      focus: () => {},
      print: () => { throw new Error("closed"); },
    } as unknown as Window;
    await expect(printWhenFontsReady(win, 50)).resolves.toBeUndefined();
  });

  it("หัวเอกสารพิมพ์มีฟอนต์ไทยสำรองในเครื่อง ไม่พึ่ง Google Fonts อย่างเดียว", () => {
    expect(PRINT_FONT_STACK).toContain("Sarabun");
    expect(PRINT_FONT_STACK).toContain("Noto Sans Thai");
    expect(PRINT_FONT_STACK).toContain("Tahoma");
    expect(PRINT_FONT_HEAD).toContain("fonts.googleapis.com");
    expect(PRINT_FONT_HEAD).toContain("font-family");
  });
});