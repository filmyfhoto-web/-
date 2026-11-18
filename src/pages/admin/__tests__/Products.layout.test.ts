import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Layout-only contract for /admin/products.
 *
 * Full render is prohibitively heavy (Supabase, camera, dropzones, dialogs),
 * so we lock the structural invariants of the split-view refactor at the
 * source level. If a future refactor drops any of these markers the test
 * fails loudly.
 */
const src = readFileSync(resolve(__dirname, "../Products.tsx"), "utf8");

describe("Products layout — desktop split view + mobile sheet", () => {
  it("uses a 62/38 (~64/36) desktop split grid", () => {
    expect(src).toMatch(/lg:grid-cols-\[minmax\(0,62fr\)_minmax\(0,38fr\)\]/);
  });

  it("renders a sticky right-hand editor panel with testid", () => {
    expect(src).toMatch(/data-testid="product-editor-panel"/);
    expect(src).toMatch(/lg:sticky/);
  });

  it("shows the empty state when no product is being edited", () => {
    expect(src).toMatch(/editorEmptyState/);
    expect(src).toMatch(/เลือกสินค้าเพื่อดูรายละเอียด/);
  });

  it("uses a green header with dynamic title (เพิ่มสินค้า / แก้ไขสินค้า)", () => {
    expect(src).toMatch(/bg-success text-success-foreground/);
    expect(src).toMatch(/editing \? "แก้ไขสินค้า" : "เพิ่มสินค้า"/);
  });

  it("keeps mobile fullscreen sheet gated on isMobile", () => {
    expect(src).toMatch(/const isMobile = useIsMobile\(\)/);
    expect(src).toMatch(/isMobile && \(\s*<Sheet/);
    expect(src).toMatch(/data-testid="product-editor-sheet"/);
  });

  it("+add resets the form (openNew clears form / editing / gallery)", () => {
    expect(src).toMatch(/function openNew\(\)\s*\{[\s\S]*setForm\(EMPTY\);[\s\S]*setEditing\(null\);[\s\S]*setGallery\(\[\]\);[\s\S]*setOpen\(true\)/);
  });

  it("clicking a row opens the editor (setEditing + setOpen(true) in edit handler)", () => {
    // Any handler that populates the form for editing must flip open=true.
    expect(src).toMatch(/setEditing\([^)]+\)[\s\S]{0,400}setOpen\(true\)/);
  });

  it("still mounts existing relations editor (wholesale/variants/bundles)", () => {
    expect(src).toMatch(/<ProductRelationsSections\s+productId=\{editing\}\s*\/>/);
  });

  it("wires the image crop dialog to the main image thumb", () => {
    expect(src).toMatch(/<ImageResizeDialog/);
    expect(src).toMatch(/onClick=\{openMainImageResize\}/);
    expect(src).toMatch(/data-testid="main-image-thumb"/);
  });

  it("routes main file input through the crop dialog", () => {
    // The <input type=file> for the main image must NOT call uploadMain
    // directly — it must enqueue a crop step first.
    expect(src).toMatch(/beginMainCrop\(f\)[\s\S]{0,200}data-testid="main-file-input"/);
  });

  it("routes gallery file input through the crop dialog queue", () => {
    expect(src).toMatch(/beginGalleryCrop\(e\.target\.files\)[\s\S]{0,200}data-testid="gallery-file-input"/);
  });

  it("cancelling the crop dialog clears the gallery queue (no mutation)", () => {
    expect(src).toMatch(/handleCropOpenChange[\s\S]{0,400}setGalleryQueue\(\[\]\)/);
  });

  it("confirmed crop uploads via the existing gallery path", () => {
    expect(src).toMatch(/handleCroppedGallery[\s\S]{0,400}uploadGalleryOne\(file\)/);
  });

  it("keeps relations mounted regardless of crop state", () => {
    expect(src).toMatch(/<ProductRelationsSections\s+productId=\{editing\}\s*\/>/);
  });

  it("row click opens the editor and action buttons stopPropagation", () => {
    expect(src).toMatch(/onClick=\{\(\) => openEdit\(p\)\}[\s\S]{0,200}data-testid="product-row"/);
    expect(src).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });
});