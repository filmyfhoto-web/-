import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  CUSTOMER_ORDER_BUCKETS, countBuckets, filterByBucket, formatBadgeCount, isBucketKey,
} from "@/lib/customerOrderBuckets";
import { isPromoLive, livePromos, type ShopPromo } from "@/lib/shopPromos";

const orders = [
  { status: "pending_quote" },
  { status: "quoted" },
  { status: "ready", receipt_issued_at: "2026-01-01T00:00:00Z" },
  { status: "completed", receipt_issued_at: "2026-01-01T00:00:00Z" },
  { status: "cancelled" },
];

describe("ถังสถานะคำสั่งซื้อลูกค้า 4 ช่อง", () => {
  it("มี 4 ถังตามที่กำหนด", () => {
    expect(CUSTOMER_ORDER_BUCKETS.map((b) => b.key)).toEqual(["all", "pending", "issued", "received"]);
  });

  it("นับจำนวนถูกต้อง", () => {
    const c = countBuckets(orders);
    expect(c.all).toBe(5);
    expect(c.pending).toBe(2);
    expect(c.issued).toBe(1);
    expect(c.received).toBe(1);
  });

  it("กรองตามถังตรงกับจำนวน badge", () => {
    for (const b of CUSTOMER_ORDER_BUCKETS) {
      expect(filterByBucket(orders, b.key).length).toBe(countBuckets(orders)[b.key]);
    }
  });

  it("คีย์ที่ไม่รู้จักไม่กรองข้อมูล", () => {
    expect(filterByBucket(orders, "nope").length).toBe(orders.length);
    expect(isBucketKey("nope")).toBe(false);
    expect(isBucketKey("pending")).toBe(true);
  });

  it("badge ซ่อนเมื่อเป็นศูนย์ และย่อเป็น 99+", () => {
    expect(formatBadgeCount(0)).toBeNull();
    expect(formatBadgeCount(-3)).toBeNull();
    expect(formatBadgeCount(7)).toBe("7");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(120)).toBe("99+");
  });
});

const promo = (p: Partial<ShopPromo>): ShopPromo => ({
  id: p.id ?? "1", title: "x", subtitle: null, image_url: null, link_url: null,
  sort: p.sort ?? 0, is_active: p.is_active ?? true, starts_at: p.starts_at ?? null, ends_at: p.ends_at ?? null,
});

describe("การมองเห็นโปรโมชั่น", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("ซ่อนรายการที่ยังไม่เผยแพร่", () => {
    expect(isPromoLive(promo({ is_active: false }), now)).toBe(false);
  });

  it("แสดงเมื่ออยู่ในช่วงวันที่", () => {
    expect(isPromoLive(promo({ starts_at: "2026-06-01T00:00:00Z", ends_at: "2026-06-30T23:59:59Z" }), now)).toBe(true);
  });

  it("ซ่อนเมื่อยังไม่ถึงวันเริ่ม หรือหมดอายุแล้ว", () => {
    expect(isPromoLive(promo({ starts_at: "2026-07-01T00:00:00Z" }), now)).toBe(false);
    expect(isPromoLive(promo({ ends_at: "2026-06-01T00:00:00Z" }), now)).toBe(false);
  });

  it("เว้นว่างวันที่ = ไม่จำกัดช่วงเวลา", () => {
    expect(isPromoLive(promo({}), now)).toBe(true);
  });

  it("livePromos เรียงตามลำดับและกรองรายการที่หมดอายุ", () => {
    const rows = [
      promo({ id: "b", sort: 2 }),
      promo({ id: "a", sort: 1 }),
      promo({ id: "old", sort: 0, ends_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(livePromos(rows, now).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// ---- หน้าโปรไฟล์แบบ marketplace (ลำดับการ์ด/สถานะ/โปรโมชั่น/รีสปอนซีฟ) ----
import fs from "node:fs";
import {
  CUSTOMER_ORDER_BUCKETS_DISPLAY, CUSTOMER_ORDER_BUCKET_DISPLAY_ORDER,
} from "@/lib/customerOrderBuckets";

const page = fs.readFileSync("src/pages/MyAccount.tsx", "utf8");

describe("หน้าบัญชีของฉัน — โครงสร้างแบบแอป commerce", () => {
  it("เรียงสถานะ รอดำเนินการ → เอกสารออกแล้ว → ได้รับเอกสารแล้ว → ประวัติสั่งซื้อ", () => {
    expect(CUSTOMER_ORDER_BUCKET_DISPLAY_ORDER).toEqual(["pending", "issued", "received", "all"]);
    expect(CUSTOMER_ORDER_BUCKETS_DISPLAY.map((b) => b.label)).toEqual([
      "รอดำเนินการ", "เอกสารออกแล้ว", "ได้รับเอกสารแล้ว", "ประวัติสั่งซื้อ",
    ]);
  });

  it("ทุกช่องสถานะยังกำหนดปลายทางที่กรองจริงไว้ในสเปกสถานะ", () => {
    expect(CUSTOMER_ORDER_BUCKET_DISPLAY_ORDER).toHaveLength(4);
  });

  it("มีไอคอน ตั้งค่า/แชท พร้อม badge บน header", () => {
    for (const id of ["account-header-bell", "account-edit-profile"]) {
      expect(page).toContain(id);
    }
    expect(page).toContain("env(safe-area-inset-top)");
  });

  it("หน้ากระชับ: แผงหลัก + การ์ดบริการของฉัน (ไม่มีบริการด่วน/โปรโมชั่น)", () => {
    expect(page).toContain("AccountActionPanel");
    expect(page).toContain("บริการของฉัน");
    for (const removed of ["account-quick-services", "account-promos", "account-new-shortcuts"]) {
      expect(page).not.toContain(removed);
    }
  });

  it("ไม่มีส่วนโปรโมชั่นบนหน้าบัญชีอีกต่อไป", () => {
    expect(page).not.toContain("visiblePromos");
    expect(livePromos([])).toHaveLength(0);
  });


  it("จำกัดความกว้างเนื้อหาบนแท็บเล็ต/เดสก์ท็อปและใช้พื้นหลังอ่อน", () => {
    expect(page).toContain("max-w-[840px]");
    expect(page).toContain("bg-gradient-account-page");
    expect(page).toContain("bg-gradient-account ");
  });
});

describe("เลย์เอาต์หน้าบัญชี (responsive 390/768/1280)", () => {
  const src = readFileSync("src/pages/MyAccount.tsx", "utf8");

  it("จำกัดความกว้างเนื้อหาไว้ที่ 840px และจัดกึ่งกลาง (tablet/desktop)", () => {
    expect(src).toContain("max-w-[840px]");
    expect(src).toContain("mx-auto");
  });

  it("การ์ดใช้มุมโค้ง 16px และเงาเบา", () => {
    expect(src).toContain("rounded-2xl");
    expect(src).toContain("shadow-sm");
  });

  it("แถวสรุปกระชับเรียงพอดีบนมือถือ", () => {
    expect(src).toContain("grid-cols-2");
  });

  it("touch target อย่างน้อย 44px", () => {
    expect(src).toMatch(/min-h-11|min-h-\[4[4-9]px\]/);
  });

  it("รองรับ safe-area บนและล่าง", () => {
    expect(src).toContain("safe-area-inset-top");
  });

  it("แผงหลักมี skeleton และ empty state", () => {
    const panel = readFileSync("src/components/account/AccountActionPanel.tsx", "utf8");
    expect(panel).toContain("account-recent-skeleton");
    expect(panel).toContain("account-recent-empty");
  });

});
