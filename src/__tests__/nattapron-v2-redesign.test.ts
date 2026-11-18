import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import { groupItems, groupKeyFor, describeOptions, validateAttachment, MAX_ATTACHMENT_BYTES } from "@/lib/cartGroups";
import { applyCoupon } from "@/lib/customerPerks";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("cart grouping & job options", () => {
  it("groups lines by producing branch", () => {
    const items = [
      { product_id: "1", name: "ปากกาลูกลื่น" },
      { product_id: "2", name: "อัดรูป 4x6" },
      { product_id: "3", name: "พิมพ์เอกสาร A4" },
    ];
    const groups = groupItems(items);
    expect(groups.map((g) => g.key)).toEqual(["general", "colorlab", "printing"]);
    expect(groupKeyFor(items[1])).toBe("colorlab");
  });

  it("describes job options in Thai", () => {
    expect(describeOptions({ size: "A4", sides: "double" })).toBe("ขนาด A4 · พิมพ์สองด้าน");
    expect(describeOptions(undefined)).toBe("");
  });

  it("flags oversized or empty attachments", () => {
    expect(validateAttachment({ name: "a.pdf", size: 1000 }).status).toBe("ready");
    expect(validateAttachment({ name: "a.pdf", size: MAX_ATTACHMENT_BYTES + 1 }).status).toBe("error");
    expect(validateAttachment({ name: "a.pdf", size: 0 }).status).toBe("error");
  });
});

describe("coupons", () => {
  beforeEach(() => localStorage.clear());

  it("enforces minimum spend and caps", () => {
    expect(applyCoupon("NATTA50", 400).ok).toBe(false);
    expect(applyCoupon("NATTA50", 600)).toMatchObject({ ok: true, discount: 50 });
    expect(applyCoupon("PRINT10", 5000).discount).toBe(200);
    expect(applyCoupon("NOPE", 1000).ok).toBe(false);
  });

  it("ไม่มีระบบแต้มสะสมในหน้าลูกค้าแล้ว", () => {
    for (const f of ["src/pages/Cart.tsx", "src/pages/MyAccount.tsx", "src/pages/Shop.tsx"]) {
      expect(read(f), f).not.toContain("แต้ม");
    }
  });
});

describe("cart screen structure", () => {
  const src = read("src/pages/Cart.tsx");

  it("renders grouped lines with option editor and attachment status", () => {
    expect(src).toContain("cart-group-");
    expect(src).toContain("cart-edit-options-");
    expect(src).toContain("cart-attach-status-");
    expect(src).toContain("ยังไม่แนบไฟล์");
    expect(src).toContain("contentVisibility"); // lazy rendering for large carts
  });

  it("offers fulfilment, rush, coupon and points controls", () => {
    for (const id of ["pickup-${v}", "cart-rush", "cart-coupon-apply", "cart-want-date"]) {
      expect(src, id).toContain(id);
    }
  });

  it("keeps a sticky footer that disables checkout with a clear message", () => {
    expect(src).toContain("cart-sticky-footer");
    expect(src).toContain("disabled={submitting || selectedItems.length === 0}");
    expect(src).toContain("cart-none-selected-hint");
    expect(src).toContain("safe-bottom");
  });
});

describe("orders & account screens", () => {
  it("order cards expose contextual actions", () => {
    const src = read("src/components/account/MyOrdersPanel.tsx");
    expect(src).toContain("order-card-actions");
    expect(src).toContain("ดูรายละเอียด");
    expect(src).toContain("สั่งซ้ำ");
    expect(src).toContain("กำหนดรับ");
  });

  it("account page shows build metadata", () => {
    const src = read("src/pages/MyAccount.tsx");
    expect(src).toContain("account-app-version");
    expect(src).toContain("BUILD_INFO.version");
    expect(src).toContain("formatThaiDateTime(BUILD_INFO.builtAt)");
  });
});
