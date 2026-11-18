import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assetCacheNames } from "@/lib/appUpdate";

const src = readFileSync("src/lib/appUpdate.ts", "utf8");
const account = readFileSync("src/pages/MyAccount.tsx", "utf8");

describe("stale build recovery", () => {
  it("keeps the workbox precache so the navigation fallback never breaks", () => {
    const names = [
      "workbox-precache-v2-https://filmyynatta.com/",
      "precache-v2",
      "static-assets",
      "pwa-assets",
      "html-nav",
      "images",
      "supabase-auth",
      "user-data",
    ];
    const dropped = assetCacheNames(names);
    expect(dropped).toEqual(["static-assets", "pwa-assets", "html-nav", "images"]);
    expect(dropped.some((n) => n.includes("precache"))).toBe(false);
  });

  it("activates a waiting service worker before reloading", () => {
    const refresh = src.slice(src.indexOf("export async function refreshAppAssets"));
    expect(refresh).toContain("SKIP_WAITING");
    expect(refresh).toContain("getRegistrations");
    expect(refresh.indexOf("SKIP_WAITING")).toBeLessThan(refresh.indexOf("caches.keys()"));
  });

  it("clears only asset caches once when the build tag changes", () => {
    expect(src).toContain("syncBuildCaches");
    expect(src).toContain("assetCacheNames");
    expect(src).not.toContain("localStorage.clear");
  });
});

describe("customer build visibility", () => {
  it("shows the running build, the server build and an update button", () => {
    for (const id of [
      "account-build-version",
      "account-build-date",
      "account-build-id",
      "account-remote-build",
      "account-update-now",
    ]) expect(account).toContain(id);
    expect(account).toContain("useBuildUpdate");
    expect(account).toContain("refreshAppAssets");
  });
});
