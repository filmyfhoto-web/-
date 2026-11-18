import { describe, it, expect } from "vitest";
import {
  buildSyncPlan,
  endpointForOrigin,
  expectedCallbackUrls,
  isSyncableOrigin,
  missingCallbackUrls,
} from "@/lib/liffDomainSync";

describe("liffDomainSync", () => {
  it("only syncs stable public https origins", () => {
    expect(isSyncableOrigin("https://www.filmyynatta.com")).toBe(true);
    expect(isSyncableOrigin("http://www.filmyynatta.com")).toBe(false);
    expect(isSyncableOrigin("http://localhost:8080")).toBe(false);
  });

  it("derives the endpoint from the live origin", () => {
    expect(endpointForOrigin("https://shop.example.com/")).toBe("https://shop.example.com/l/shop");
  });

  it("includes the new domain's callbacks plus known hosts", () => {
    const urls = expectedCallbackUrls("https://new.example.com", "https://api.example.com/fn/cb");
    expect(urls).toContain("https://new.example.com/staff");
    expect(urls).toContain("https://new.example.com/customer/login");
    expect(urls).toContain("https://new.example.com/l/shop");
    expect(urls).toContain("https://api.example.com/fn/cb");
    expect(urls).toContain("https://www.filmyynatta.com/staff");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("finds only the missing entries", () => {
    expect(missingCallbackUrls(["https://a/x/"], ["https://a/x", "https://b/y"])).toEqual([
      "https://b/y",
    ]);
  });

  it("flags a domain change and never loses existing callbacks", () => {
    const plan = buildSyncPlan({
      origin: "https://new.example.com",
      currentEndpoint: "https://old.example.com/l/shop",
      currentCallbacks: ["https://old.example.com/staff"],
    });
    expect(plan.needsSync).toBe(true);
    expect(plan.endpointChanged).toBe(true);
    expect(plan.endpoint).toBe("https://new.example.com/l/shop");
    expect(plan.nextCallbacks).toContain("https://old.example.com/staff");
    expect(plan.nextCallbacks).toContain("https://new.example.com/staff");
  });

  it("is a no-op on localhost previews", () => {
    const plan = buildSyncPlan({ origin: "http://localhost:8080", currentEndpoint: null });
    expect(plan.needsSync).toBe(false);
  });
});
