import { describe, expect, it, beforeEach } from "vitest";
import {
  sanitizeNext,
  readIdToken,
  writeIdToken,
  clearIdToken,
  writeFriendshipHint,
  readFriendshipHint,
  clearCustomerSession,
} from "@/lib/lineSession";

describe("sanitizeNext", () => {
  it("accepts safe relative paths", () => {
    expect(sanitizeNext("/shop")).toBe("/shop");
    expect(sanitizeNext("/cart?x=1")).toBe("/cart?x=1");
    expect(sanitizeNext("/my-orders/abc#top")).toBe("/my-orders/abc#top");
  });
  it("rejects protocol-relative and external URLs", () => {
    expect(sanitizeNext("//evil.com")).toBeNull();
    expect(sanitizeNext("http://evil.com/shop")).toBeNull();
    expect(sanitizeNext("https://evil.com")).toBeNull();
  });
  it("rejects backslash and control chars", () => {
    expect(sanitizeNext("/\\evil")).toBeNull();
    expect(sanitizeNext("/shop\u0000")).toBeNull();
  });
  it("rejects non-strings and empties", () => {
    expect(sanitizeNext(undefined)).toBeNull();
    expect(sanitizeNext("")).toBeNull();
    expect(sanitizeNext("shop")).toBeNull();
  });
});

describe("id_token + friendship-hint helpers", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it("round-trips id_token and clears it", () => {
    writeIdToken("eyJhbGciOi.header.sig");
    expect(readIdToken()).toBe("eyJhbGciOi.header.sig");
    clearIdToken();
    expect(readIdToken()).toBeNull();
  });

  it("ignores non-string / empty id_tokens", () => {
    writeIdToken(undefined);
    writeIdToken(null);
    writeIdToken("");
    expect(readIdToken()).toBeNull();
  });

  it("friendship hint is stored but is NOT used as an authz decision", () => {
    writeFriendshipHint({ is_friend: true, checked_at: new Date().toISOString() });
    expect(readFriendshipHint()?.is_friend).toBe(true);
  });

  it("clearCustomerSession wipes id_token, binding, friendship hint, and guest data", () => {
    writeIdToken("secret.token.value");
    sessionStorage.setItem("line_binding", JSON.stringify({ line_user_id: "U1" }));
    sessionStorage.setItem("line_friendship_hint", JSON.stringify({ is_friend: true, checked_at: "x" }));
    localStorage.setItem("guest_session_v1", JSON.stringify({ guest_id: "g", phone: "0812345678", name: "x", project: "", org_slug: null, org_id: null, org_name: null, org_approved: true, price_group_id: null, school_token: null, created_at: "x" }));
    localStorage.setItem("guest_customer_snapshot", JSON.stringify({ name: "x" }));
    clearCustomerSession();
    expect(sessionStorage.getItem("line_id_token")).toBeNull();
    expect(sessionStorage.getItem("line_binding")).toBeNull();
    expect(sessionStorage.getItem("line_friendship_hint")).toBeNull();
    expect(localStorage.getItem("guest_session_v1")).toBeNull();
    expect(localStorage.getItem("guest_customer_snapshot")).toBeNull();
  });
});