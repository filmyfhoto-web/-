import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sw = readFileSync("src/lib/registerSW.ts", "utf8");
const gate = readFileSync("src/components/AppUpdateGate.tsx", "utf8");
const viteConfig = readFileSync("vite.config.ts", "utf8");
const appUpdate = readFileSync("src/lib/appUpdate.ts", "utf8");
const posBar = readFileSync("src/components/pos/PosVersionBar.tsx", "utf8");

describe("mobile update stability", () => {
  it("reloads at most once per controllerchange and never on first install", () => {
    expect(sw).toContain("const hadController = !!navigator.serviceWorker.controller");
    expect(sw).toContain("if (!hadController)");
    expect(sw).toContain("claimUpdateReload()");
  });

  it("routes every automatic reload through the loop budget", () => {
    expect(appUpdate).toContain("claimUpdateReload");
  });

  it("does not leave a ?v= cache-buster in the address bar", () => {
    expect(appUpdate).toContain('u.searchParams.delete("v")');
  });

  it("never precaches the SPA shell or pins navigations to it", () => {
    expect(viteConfig).toContain('globIgnores: ["**/index.html"]');
    expect(viteConfig).toContain("navigateFallback: undefined");
    expect(viteConfig).toContain('handler: "NetworkFirst"');
  });

  it("keeps a failed update from freezing the screen", () => {
    expect(gate).toContain("refreshAppAssets");
    expect(gate).toMatch(/catch\s*{[^}]*}/);
  });

  it("shows no full-width update overlay over the app chrome", () => {
    expect(posBar).not.toContain("fixed inset-x-0 top-0");
    // the only full-screen layer is the explicitly opened dialog
    const overlays = gate.match(/fixed inset-0/g) ?? [];
    expect(overlays.length).toBe(1);
    expect(gate).toContain("{open && (");
  });
});
