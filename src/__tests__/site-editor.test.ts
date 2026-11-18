import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  DEFAULT_SITE_CONFIG, PUBLIC_ROUTE_OPTIONS, isValidExternalUrl, isValidMenuTarget,
  moveMenuItem, moveSection, normalizeSiteConfig, sectionVisible,
} from "@/lib/siteConfig";

const editor = fs.readFileSync("src/film-shop/components/site/SiteEditorPage.tsx", "utf8");
const welcome = fs.readFileSync("src/pages/Welcome.tsx", "utf8");
const sidebar = fs.readFileSync("src/film-shop/components/layout/Sidebar.tsx", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const filmApp = fs.readFileSync("src/film-shop/FilmShopApp.tsx", "utf8");

describe("จัดการหน้าเว็บไซต์ — ค่าเริ่มต้นและ fallback", () => {
  it("ค่าเริ่มต้นตรงกับข้อความบนหน้า public เดิม", () => {
    expect(DEFAULT_SITE_CONFIG.hero_title_line1).toBe("งานพิมพ์ ที่ใช่");
    expect(DEFAULT_SITE_CONFIG.hero_title_line2).toBe("บริการ ที่คุณไว้ใจ");
    expect(DEFAULT_SITE_CONFIG.hours_text).toBe("จันทร์ - เสาร์ 08.00 - 18.00 น.");
    expect(DEFAULT_SITE_CONFIG.line_cta.label).toBe("เพิ่มเพื่อนใน LINE");
    expect(DEFAULT_SITE_CONFIG.menu.map((m) => m.label)).toEqual([
      "หน้าแรก", "สั่งซื้อสินค้า", "คำสั่งซื้อของฉัน", "โปรโมชั่น", "ติดต่อเรา",
    ]);
  });

  it("ค่าว่าง/พัง → คืนค่าเริ่มต้น (หน้า public ไม่แตก)", () => {
    expect(normalizeSiteConfig(null)).toEqual(DEFAULT_SITE_CONFIG);
    expect(normalizeSiteConfig({})).toEqual(DEFAULT_SITE_CONFIG);
    expect(normalizeSiteConfig({ hero_desc: 123, menu: "x" })).toEqual(DEFAULT_SITE_CONFIG);
  });

  it("รวมค่าที่บันทึกกับค่าเริ่มต้นได้ถูกต้อง", () => {
    const cfg = normalizeSiteConfig({ hero_title_line1: "งานพิมพ์ใหม่" });
    expect(cfg.hero_title_line1).toBe("งานพิมพ์ใหม่");
    expect(cfg.hero_desc).toBe(DEFAULT_SITE_CONFIG.hero_desc);
  });

  it("รูป hero ต้องเป็น URL http(s) เท่านั้น", () => {
    expect(normalizeSiteConfig({ hero_image_url: "javascript:alert(1)" }).hero_image_url).toBeNull();
    expect(normalizeSiteConfig({ hero_image_url: "https://x.test/a.jpg" }).hero_image_url).toBe("https://x.test/a.jpg");
    expect(isValidExternalUrl("https://lin.ee/x")).toBe(true);
    expect(isValidExternalUrl("ลิงก์")).toBe(false);
  });
});

describe("เมนู — ชื่อเปลี่ยนได้ แต่ route ต้องไม่พัง", () => {
  it("ปลายทางต้องเป็น public route จริง", () => {
    expect(isValidMenuTarget({ kind: "route", to: "/shop" })).toBe(true);
    expect(isValidMenuTarget({ kind: "route", to: "/admin/secret" })).toBe(false);
    expect(isValidMenuTarget({ kind: "anchor", to: "#contact" })).toBe(true);
    expect(isValidMenuTarget({ kind: "external", to: "https://a.test" })).toBe(true);
    expect(isValidMenuTarget({ kind: "external", to: "notaurl" })).toBe(false);
  });

  it("ปลายทางไม่ถูกต้องที่บันทึกมา → ตกกลับ route เดิม", () => {
    const cfg = normalizeSiteConfig({
      menu: [{ id: "shop", label: "สินค้าใหม่", to: "/admin/products", kind: "route", visible: true }],
    });
    expect(cfg.menu[0].label).toBe("สินค้าใหม่");
    expect(cfg.menu[0].to).toBe("/shop");
  });

  it("ซ่อนเมนู = ซ่อนเฉพาะ UI ไม่ลบ route", () => {
    const cfg = normalizeSiteConfig({
      menu: DEFAULT_SITE_CONFIG.menu.map((m) => (m.id === "promotions" ? { ...m, visible: false } : m)),
    });
    expect(cfg.menu.find((m) => m.id === "promotions")?.visible).toBe(false);
    expect(cfg.menu).toHaveLength(DEFAULT_SITE_CONFIG.menu.length);
    expect(app).toContain('path="/promotions"');
  });

  it("เรียงลำดับเมนูได้จริง", () => {
    const moved = moveMenuItem(DEFAULT_SITE_CONFIG, "shop", -1);
    expect(moved.menu.map((m) => m.id).slice(0, 2)).toEqual(["shop", "home"]);
    expect(moveMenuItem(DEFAULT_SITE_CONFIG, "home", -1).menu).toEqual(DEFAULT_SITE_CONFIG.menu);
  });

  it("ตัวเลือกปลายทางมีเฉพาะ route ที่ App ประกาศไว้จริง", () => {
    for (const o of PUBLIC_ROUTE_OPTIONS) {
      if (o.to === "/") continue;
      expect(app).toContain(`path="${o.to}"`);
    }
  });
});

describe("ส่วนแสดงผล", () => {
  it("เปิด/ปิด section ได้ และ hero/จุดเด่นอยู่ตำแหน่งคงที่", () => {
    const cfg = normalizeSiteConfig({
      sections: [{ key: "contact", visible: false }, { key: "hero", visible: true }],
    });
    expect(cfg.sections[0].key).toBe("hero");
    expect(sectionVisible(cfg, "contact")).toBe(false);
    expect(moveSection(cfg, "hero", 1)).toEqual(cfg);
  });

  it("สลับลำดับ section ที่ย้ายได้", () => {
    const moved = moveSection(DEFAULT_SITE_CONFIG, "categories", -1);
    expect(moved.sections.map((s) => s.key)).toEqual(["hero", "highlights", "categories", "order", "contact"]);
  });
});

describe("การเชื่อมต่อหน้า public + ทางเข้าแอดมิน", () => {
  it("หน้า public อ่านค่าจาก settings และมี fallback", () => {
    expect(welcome).toContain("useSiteConfig");
    expect(welcome).toContain("DEFAULT_SITE_CONFIG");
    expect(welcome).toContain("config.hero_title_line1");
    expect(welcome).toContain("heroAsset.url"); // รูปเดิมเป็น fallback
  });

  it("มีเมนู “จัดการหน้าเว็บไซต์” ใต้หมวดข้อมูลร้าน และเฉพาะแอดมิน", () => {
    expect(sidebar).toContain("จัดการหน้าเว็บไซต์");
    expect(sidebar).toContain("site-editor");
    expect(sidebar).toContain("!item.adminOnly || isAdmin");
  });

  it("route canonical เดียว + bookmark redirect", () => {
    expect(filmApp).toContain("'site-editor': 'จัดการหน้าเว็บไซต์'");
    expect(filmApp).toContain("case 'site-editor'");
    expect(app).toContain('path="/admin/site-editor"');
    // เข้าตรงจากโซนแอดมิน (ไม่ต้องสลับเข้าพื้นที่ทำงาน FILM SHOP)
    expect(app).toContain("<RequireStaff><AdminSiteEditor /></RequireStaff>");
  });

  it("editor มีปุ่มจริงครบ + live preview + dirty guard", () => {
    expect(editor).toContain("site-editor-save");
    expect(editor).toContain("site-editor-cancel");
    expect(editor).toContain("site-editor-reset");
    expect(editor).toContain("AlertDialog"); // confirm ก่อนคืนค่า
    expect(editor).toContain("useFormGuard");
    expect(editor).toContain("site-preview-desktop");
    expect(editor).toContain("site-preview-mobile");
    expect(editor).toContain("WelcomeView");
  });

  it("อัปโหลดรูปใช้ bucket แยก website-assets และจำกัดชนิด/ขนาดไฟล์", () => {
    expect(editor).toContain("WEBSITE_ASSET_BUCKET");
    expect(editor).toContain("MAX_IMAGE_BYTES");
    expect(editor).toContain("file.type.startsWith('image/')");
    expect(editor).not.toContain("product-images");
  });
});
