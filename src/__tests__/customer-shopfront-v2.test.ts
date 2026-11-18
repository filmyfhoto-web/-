import { describe, it, expect } from "vitest";
import fs from "node:fs";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("customer shopfront redesign (v1.2.0)", () => {
  it("bottom navigation exposes the four customer tabs", () => {
    const src = read("src/components/layout/CustomerLayout.tsx");
    for (const label of ["หน้าแรก", "สินค้า", "แจ้งเตือน", "ฉัน"]) {
      expect(src).toContain(label);
    }
    expect(src).toContain("grid-cols-4");
    expect(src).toContain('data-shopfront="nattapron"');
  });

  it("uses the warm Nattapron theme tokens, not hardcoded sky utilities", () => {
    expect(read("src/index.css")).toContain('[data-shopfront="nattapron"]');
    expect(read("src/pages/Shop.tsx")).not.toContain("bg-sky-50");
  });

  // Policy change (customer web app relaunch): browsing and cart are public,
  // the LINE gate moved to the "ยืนยันสั่งซื้อ" action. Personal data routes
  // keep the route-level gate.
  it("keeps the LINE gate on personal-data routes only", () => {
    const app = read("src/App.tsx");
    for (const path of ["/my-orders", "/my-account", "/notifications"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${path}"`));
      expect(line, `route ${path}`).toBeTruthy();
      expect(line!).toContain("RequireLineLink");
    }
    for (const path of ["/shop", "/cart"]) {
      const line = app.split("\n").find((l) => l.includes(`path="${path}"`));
      expect(line, `route ${path}`).toBeTruthy();
      expect(line!, `route ${path} must stay public`).not.toContain("RequireLineLink");
    }
  });

  it("ยืนยันสั่งซื้อได้โดยไม่ต้องผูก LINE (เปิดกล่องผูก LINE เฉพาะเมื่อเซิร์ฟเวอร์สั่ง)", () => {
    const cart = read("src/pages/Cart.tsx");
    expect(cart).toContain("LineOrderGate");
    expect(cart).not.toContain('gateStatus !== "ready"');
    // form draft survives the add-friend round trip
    expect(cart).toContain("readCheckoutDraft");
    expect(cart).toContain("writeCheckoutDraft");
  });


  it("cart supports selection, select-all and a sticky checkout footer", () => {
    const cart = read("src/pages/Cart.tsx");
    expect(cart).toContain("cart-select-all");
    expect(cart).toContain("cart-sticky-footer");
    expect(cart).toContain("ตรวจสอบก่อนสั่ง");
    // Only the selected lines are priced and submitted.
    expect(cart).toContain("selectedItems.reduce");
    expect(cart).toContain("items: selectedItems.map");
    expect(cart).toContain("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
  });

  it("orders panel shows real status shortcuts mapped to order statuses", () => {
    const src = read("src/components/account/MyOrdersPanel.tsx");
    expect(src).toContain("order-bucket-");
    expect(src).toContain("awaiting");
    expect(src).toContain("pending_quote");
    // ประวัติคำสั่งซื้อถูกรวมเข้าหน้า "ฉัน" แล้ว — /my-orders เป็นทางเปลี่ยนเส้นทาง
    const account = read("src/pages/MyAccount.tsx");
    expect(account).toContain("<MyOrdersPanel />");
    expect(read("src/pages/MyOrders.tsx")).toContain('to={`/my-account${search}${hash}`}');
    // no invented financial products
    for (const banned of ["เหรียญ", "กระเป๋าเงิน", "สินเชื่อ", "ประกัน", "VIP"]) {
      expect(src).not.toContain(banned);
    }
  });

  it("AI assistant is optional and never blocks shopping", () => {
    const ai = read("src/components/shop/AiProductSearch.tsx");
    expect(ai).toContain("ai-product-search");
    expect(ai).not.toMatch(/OPENAI|sk-/);
    // falls back to the raw query when the server call fails
    expect(ai).toContain("onSearch(query)");
    const fn = read("supabase/functions/ai-product-search/index.ts");
    expect(fn).toContain('mode: "keyword"');
  });
});
