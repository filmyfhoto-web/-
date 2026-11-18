import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("LINE token-hash session regression", () => {
  it("never mixes email with token_hash and requires a real session", () => {
    const source = readFileSync("src/lib/lineOauth.ts", "utf8");
    const verifyCall = source.match(/verifyOtp\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
    expect(verifyCall).toContain('type: "magiclink"');
    expect(verifyCall).toContain("token_hash: res.token_hash");
    expect(verifyCall).not.toContain("email:");
    expect(source).toContain("!otpData.session || !otpData.user");
  });
});