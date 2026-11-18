import { describe, it, expect } from "vitest";
import { launchTarget } from "@/lib/launchTarget";
import {
  POS_LOGIN_PATH, readLoginContext, resolvePostLoginTarget, magicLinkRedirect, safeNext, withApp,
} from "@/lib/posLoginContext";

describe("POS login context", () => {
  it("keeps app=pos when launching signed out", () => {
    const to = launchTarget("pos", { signedIn: false } as any);
    expect(to).toBe(POS_LOGIN_PATH);
    expect(to).toContain("app=pos");
    expect(decodeURIComponent(to)).toContain("next=/pos/register");
  });

  it("rejects unsafe next values (open redirect)", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/../admin", "/random", "", null]) {
      expect(safeNext(bad as any)).toBeNull();
    }
    expect(safeNext("%2Fpos%2Fregister")).toBe("/pos/register");
  });

  it("reads app + next from the login URL", () => {
    expect(readLoginContext("?app=pos&next=%2Fpos%2Fregister")).toEqual({ app: "pos", next: "/pos/register" });
    expect(readLoginContext("?app=evil&next=https://x")).toEqual({ app: null, next: null });
  });

  it("routes an authorised user to the register with the pos manifest", () => {
    const ctx = readLoginContext("?app=pos&next=%2Fpos%2Fregister");
    expect(resolvePostLoginTarget(ctx, { isOwner: true })).toBe("/pos/register?app=pos");
    expect(resolvePostLoginTarget(ctx, { isStaffAny: true, canPos: true })).toBe("/pos/register?app=pos");
  });

  it("downgrades a user without POS permission to their allowed home", () => {
    const ctx = readLoginContext("?app=pos&next=%2Fpos%2Fregister");
    expect(resolvePostLoginTarget(ctx, { isStaffAny: true, canPos: false, canStock: true })).toBe("/pos/stock");
    expect(resolvePostLoginTarget(ctx, {})).toBe("/shop");
  });

  it("sends magic links back through /launch so the pos manifest survives", () => {
    expect(magicLinkRedirect("https://x.com", { app: "pos", next: "/pos/register" }))
      .toBe("https://x.com/launch?app=pos");
    expect(magicLinkRedirect("https://x.com", { app: null, next: null })).toBe("https://x.com/staff/home");
  });

  it("withApp preserves the manifest query on any target", () => {
    expect(withApp("/pos/register", "pos")).toBe("/pos/register?app=pos");
    expect(withApp("/pos/register?x=1", "pos")).toBe("/pos/register?x=1&app=pos");
    expect(withApp("/staff/home", null)).toBe("/staff/home");
  });
});
