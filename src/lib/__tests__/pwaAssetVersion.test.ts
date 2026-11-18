import { describe, expect, it, beforeEach } from "vitest";
import { applyPwaManifest, versionedAsset, PWA_ASSET_VERSION } from "../pwaManifest";

describe("PWA asset cache-busting", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("appends the release tag to asset URLs", () => {
    expect(versionedAsset("/icon-192.png")).toBe(`/icon-192.png?v=${encodeURIComponent(PWA_ASSET_VERSION)}`);
    expect(versionedAsset("/m.webmanifest?x=1")).toContain("&v=");
  });

  it("links a versioned manifest and apple-touch-icon", () => {
    applyPwaManifest("staff");
    const manifest = document.head.querySelector('link[rel="manifest"]')!.getAttribute("href")!;
    const apple = document.head.querySelector('link[rel="apple-touch-icon"]')!.getAttribute("href")!;
    expect(manifest.startsWith("/manifest-staff.webmanifest?v=")).toBe(true);
    expect(apple.startsWith("/icons/staff-apple-touch.png?v=")).toBe(true);
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')!.getAttribute("content")).toBe("งานและสต๊อก");
  });

  it("is idempotent across repeated applies", () => {
    applyPwaManifest("admin");
    const first = document.head.querySelector('link[rel="manifest"]')!.getAttribute("href");
    applyPwaManifest("admin");
    expect(document.head.querySelectorAll('link[rel="manifest"]').length).toBe(1);
    expect(document.head.querySelector('link[rel="manifest"]')!.getAttribute("href")).toBe(first);
  });
});
