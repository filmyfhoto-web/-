import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NEW_LIFF_ID = "2010762305-5Yqzh5tB";
const NEW_LOGIN_CHANNEL_ID = "2010762305";
const CANONICAL_ENDPOINT = "https://filmyynatta.com/l/shop";
// Deprecated identifiers that must never reappear in runtime source
const FORBIDDEN = ["2010588895-Va27uCcl", "2010755727-X3zoHLNM"];

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("LIFF configuration consistency", () => {
  it("LiffShop uses the new fallback LIFF ID and canonical endpoint", () => {
    const src = read("src/pages/LiffShop.tsx");
    expect(src).toContain(`FALLBACK_LIFF_ID = "${NEW_LIFF_ID}"`);
    expect(src).toContain(`CANONICAL_LIFF_ENDPOINT = "${CANONICAL_ENDPOINT}"`);
  });

  it("Admin Settings default LIFF ID matches the new LINE Login channel", () => {
    const src = read("src/pages/admin/Settings.tsx");
    expect(src).toContain(`DEFAULT_LIFF_ID = "${NEW_LIFF_ID}"`);
    // Prefix must equal the LINE Login channel id
    expect(NEW_LIFF_ID.split("-")[0]).toBe(NEW_LOGIN_CHANNEL_ID);
  });

  for (const rel of [
    "src/pages/LiffShop.tsx",
    "src/pages/admin/LiffCheck.tsx",
    "src/pages/admin/Settings.tsx",
  ]) {
    it(`${rel} contains no deprecated LIFF identifiers`, () => {
      const src = read(rel);
      for (const bad of FORBIDDEN) {
        expect(src, `should not contain ${bad}`).not.toContain(bad);
      }
    });
  }
});