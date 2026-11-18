import { describe, it, expect } from "vitest";
import { canonicalPublicUrl, PUBLIC_ORIGIN, PUBLISHED_LOVABLE_HOST } from "@/lib/hostMode";

const prod = { inIframe: false, isProd: true };

describe("canonicalPublicUrl", () => {
  it("moves the published Lovable mirror to the shop domain", () => {
    expect(
      canonicalPublicUrl(
        { hostname: PUBLISHED_LOVABLE_HOST, pathname: "/shop", search: "?app=customer" },
        prod,
      ),
    ).toBe(`${PUBLIC_ORIGIN}/shop?app=customer`);
  });

  it("keeps the real domain untouched", () => {
    expect(canonicalPublicUrl({ hostname: "filmyynatta.com", pathname: "/shop" }, prod)).toBeNull();
    expect(canonicalPublicUrl({ hostname: "www.filmyynatta.com", pathname: "/shop" }, prod)).toBeNull();
  });

  it("never redirects in the editor preview iframe, dev, or preview hosts", () => {
    expect(
      canonicalPublicUrl({ hostname: PUBLISHED_LOVABLE_HOST, pathname: "/shop" }, { inIframe: true, isProd: true }),
    ).toBeNull();
    expect(
      canonicalPublicUrl({ hostname: PUBLISHED_LOVABLE_HOST, pathname: "/shop" }, { inIframe: false, isProd: false }),
    ).toBeNull();
    expect(
      canonicalPublicUrl({ hostname: "id-preview--abc.lovable.app", pathname: "/shop" }, prod),
    ).toBeNull();
    expect(canonicalPublicUrl({ hostname: "localhost", pathname: "/shop" }, prod)).toBeNull();
  });
});
