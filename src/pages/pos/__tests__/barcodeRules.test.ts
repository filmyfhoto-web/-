import { describe, it, expect } from "vitest";
import { normalizeBarcode, DEFAULT_RULES } from "../barcodeRules";

describe("normalizeBarcode", () => {
  it("returns trimmed code by default", () => {
    expect(normalizeBarcode("  8850123456789  ", DEFAULT_RULES)).toBe("8850123456789");
  });

  it("strips prefix and suffix", () => {
    const rules = { ...DEFAULT_RULES, stripPrefix: "00", stripSuffix: "-X" };
    expect(normalizeBarcode("00ABC123-X", rules)).toBe("ABC123");
  });

  it("uppercases when case=upper", () => {
    expect(normalizeBarcode("abc", { ...DEFAULT_RULES, caseMode: "upper" })).toBe("ABC");
  });

  it("rejects codes that fail length filter", () => {
    const rules = { ...DEFAULT_RULES, allowedLengths: [8, 13] };
    expect(normalizeBarcode("12345", rules)).toBeNull();
    expect(normalizeBarcode("12345678", rules)).toBe("12345678");
    expect(normalizeBarcode("1234567890123", rules)).toBe("1234567890123");
  });
});