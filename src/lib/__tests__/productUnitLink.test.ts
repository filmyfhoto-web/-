import { describe, it, expect } from "vitest";
import {
  coerceRatio,
  deriveWrapperAvailability,
  validateLinkInput,
  translateLinkRpcError,
  LINK_ERROR_MESSAGES_TH,
} from "@/lib/productUnitLink";

describe("productUnitLink — coerceRatio", () => {
  it("accepts positive integers only", () => {
    expect(coerceRatio(1)).toBe(1);
    expect(coerceRatio("4")).toBe(4);
    expect(coerceRatio("40")).toBe(40);
  });
  it("rejects non-positive, non-integer, empty, or garbage", () => {
    expect(coerceRatio(0)).toBeNull();
    expect(coerceRatio(-3)).toBeNull();
    expect(coerceRatio(1.5)).toBeNull();
    expect(coerceRatio("")).toBeNull();
    expect(coerceRatio(null)).toBeNull();
    expect(coerceRatio("abc")).toBeNull();
  });
});

describe("productUnitLink — deriveWrapperAvailability", () => {
  it("floors base / ratio and reports remainder", () => {
    expect(deriveWrapperAvailability(10, 4)).toEqual({ available: 2, remainder: 2 });
    expect(deriveWrapperAvailability(40, 40)).toEqual({ available: 1, remainder: 0 });
    expect(deriveWrapperAvailability(0, 4)).toEqual({ available: 0, remainder: 0 });
  });
  it("returns zero on invalid inputs", () => {
    expect(deriveWrapperAvailability(-1, 4)).toEqual({ available: 0, remainder: 0 });
    expect(deriveWrapperAvailability(10, 0)).toEqual({ available: 0, remainder: 0 });
    expect(deriveWrapperAvailability(10, 1.5)).toEqual({ available: 0, remainder: 0 });
  });
});

describe("productUnitLink — validateLinkInput", () => {
  const W = "wrap-1", B = "base-1", X = "other";

  it("requires both ids", () => {
    expect(validateLinkInput({ wrapperId: "", baseId: B, ratio: 4 })).toBe("wrapper_and_base_required");
  });
  it("rejects self link", () => {
    expect(validateLinkInput({ wrapperId: W, baseId: W, ratio: 4 })).toBe("self_link_forbidden");
  });
  it("requires positive integer ratio", () => {
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 0 })).toBe("ratio_must_be_positive_integer");
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: "1.5" })).toBe("ratio_must_be_positive_integer");
  });
  it("rejects SKU-owning wrapper or base", () => {
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4, wrapperHasVariants: true })).toBe("wrapper_has_variants_conflict");
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4, baseHasVariants: true })).toBe("base_has_variants_conflict");
  });
  it("rejects chain: base is itself a wrapper", () => {
    const otherLinks = [{ wrapper_id: B, base_id: X, enabled: true }];
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4, otherLinks })).toBe("base_is_itself_a_wrapper_no_chain");
  });
  it("rejects promotion: wrapper is already used as a base", () => {
    const otherLinks = [{ wrapper_id: X, base_id: W, enabled: true }];
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4, otherLinks })).toBe("wrapper_is_already_base_of_other_wrapper");
  });
  it("passes valid linking", () => {
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4 })).toBeNull();
  });
  it("ignores disabled other links", () => {
    const otherLinks = [
      { wrapper_id: B, base_id: X, enabled: false },
      { wrapper_id: X, base_id: W, enabled: false },
    ];
    expect(validateLinkInput({ wrapperId: W, baseId: B, ratio: 4, otherLinks })).toBeNull();
  });
});

describe("productUnitLink — translateLinkRpcError", () => {
  it("maps known server codes to Thai", () => {
    expect(translateLinkRpcError("self_link_forbidden")).toBe(LINK_ERROR_MESSAGES_TH.self_link_forbidden);
    expect(translateLinkRpcError("base_is_itself_a_wrapper_no_chain: extra")).toBe(LINK_ERROR_MESSAGES_TH.base_is_itself_a_wrapper_no_chain);
  });
  it("maps not_authorized", () => {
    expect(translateLinkRpcError("not_authorized")).toMatch(/สิทธิ์/);
  });
  it("passes through unknown messages", () => {
    expect(translateLinkRpcError("boom")).toBe("boom");
  });
});