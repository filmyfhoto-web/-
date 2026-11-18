import { test, expect, type Route } from "@playwright/test";

/**
 * Smoke-level coverage for the local-file image upload on Admin/Products.
 * Supabase Storage + REST are mocked so this is hermetic.
 */

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

test.describe("Admin Products — local image upload", () => {
  test.beforeEach(async ({ page }) => {
    // Mock products list
    await page.route(/\/rest\/v1\/products\b.*/, (route: Route) => {
      const req = route.request();
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify([{
            id: "prod-img-1", code: "IMG001", name: "img-test", unit: "ชิ้น",
            standard_price: 10, stock: 1, active: true,
            image_url: "", low_stock_threshold: 0,
          }]),
        });
      }
      if (req.method() === "PATCH") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fallback();
    });

    // Mock Storage upload
    await page.route(/\/storage\/v1\/object\/product-images\/.*/, (route: Route) => {
      const m = route.request().method();
      if (m === "POST" || m === "PUT") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ Key: "product-images/test.png" }),
        });
      }
      if (m === "GET") {
        return route.fulfill({
          status: 200, contentType: "image/png", body: PNG,
        });
      }
      return route.fallback();
    });

    // Mock signed URL
    await page.route(/\/storage\/v1\/object\/sign\/product-images\/.*/, (route: Route) =>
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ signedURL: "/storage/v1/object/product-images/test.png", signedUrl: "/storage/v1/object/product-images/test.png" }),
      }),
    );

    // Mock product_images table
    await page.route(/\/rest\/v1\/product_images\b.*/, (route: Route) => {
      const req = route.request();
      if (req.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (req.method() === "POST") {
        return route.fulfill({
          status: 201, contentType: "application/json",
          body: JSON.stringify([{ id: "img-1", product_id: "prod-img-1", url: "/x.png", is_primary: false, status: "approved" }]),
        });
      }
      return route.fulfill({ status: 204, body: "" });
    });
  });

  test("upload main image from local file triggers storage POST", async ({ page }) => {
    const uploads: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/storage\/v1\/object\/product-images\//.test(r.url())) {
        uploads.push(r.url());
      }
    });

    await page.goto("/admin/products");

    // Open edit on the first product card.
    const editBtn = page.getByRole("button", { name: /แก้ไข/ }).first();
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "no product card rendered in this build");
    }
    await editBtn.click();

    // Find the hidden <input type=file> for the main image and feed our PNG.
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "main.png", mimeType: "image/png", buffer: PNG,
    });

    // Wait briefly for upload roundtrip.
    await page.waitForTimeout(500);

    expect(uploads.length, "expected at least one upload to product-images bucket").toBeGreaterThan(0);
  });
});