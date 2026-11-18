import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOrderLinkToken, saveOrderLinkToken, clearOrderLinkToken } from "../orderLinkTokens";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const eq = c.indexOf("=");
    const name = (eq >= 0 ? c.slice(0, eq) : c).trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  });
}

describe("orderLinkTokens", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
  });

  it("round-trips a saved token", () => {
    saveOrderLinkToken("abc", "tok-1");
    expect(readOrderLinkToken("abc")).toBe("tok-1");
  });

  it("returns empty for unknown order", () => {
    expect(readOrderLinkToken("nope")).toBe("");
  });

  it("expires and cleans up when TTL has passed", () => {
    localStorage.setItem(
      "order_link_token_abc",
      JSON.stringify({ token: "old", exp: Date.now() - 1000 }),
    );
    expect(readOrderLinkToken("abc")).toBe("");
    expect(localStorage.getItem("order_link_token_abc")).toBeNull();
  });

  it("falls back to cookie when localStorage is empty", () => {
    document.cookie = "olt_abc=cookietok; Path=/";
    expect(readOrderLinkToken("abc")).toBe("cookietok");
    // rehydrates localStorage for next read
    expect(localStorage.getItem("order_link_token_abc")).toContain("cookietok");
  });

  it("migrates legacy sessionStorage entries", () => {
    sessionStorage.setItem("order_link_token_abc", "legacy-tok");
    expect(readOrderLinkToken("abc")).toBe("legacy-tok");
    expect(sessionStorage.getItem("order_link_token_abc")).toBeNull();
    expect(localStorage.getItem("order_link_token_abc")).toContain("legacy-tok");
  });

  it("clearOrderLinkToken wipes all surfaces", () => {
    saveOrderLinkToken("abc", "tok-1");
    clearOrderLinkToken("abc");
    expect(readOrderLinkToken("abc")).toBe("");
  });
});