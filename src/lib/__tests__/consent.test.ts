import { describe, it, expect } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, hasValidConsent, isConsentRequiredError } from "@/lib/consent";
import { consentFooterLine } from "@/lib/csv";

describe("hasValidConsent", () => {
  it("returns false for null/undefined profile", () => {
    expect(hasValidConsent(null)).toBe(false);
    expect(hasValidConsent(undefined)).toBe(false);
  });

  it("returns false when versions are missing", () => {
    expect(hasValidConsent({})).toBe(false);
    expect(hasValidConsent({ accepted_terms_version: CURRENT_TERMS_VERSION })).toBe(false);
    expect(hasValidConsent({ accepted_privacy_version: CURRENT_PRIVACY_VERSION })).toBe(false);
  });

  it("returns false when version is stale (auto re-consent trigger)", () => {
    expect(
      hasValidConsent({
        accepted_terms_version: "2020-01-01",
        accepted_privacy_version: CURRENT_PRIVACY_VERSION,
      }),
    ).toBe(false);
    expect(
      hasValidConsent({
        accepted_terms_version: CURRENT_TERMS_VERSION,
        accepted_privacy_version: "2020-01-01",
      }),
    ).toBe(false);
  });

  it("returns true only when both versions match current", () => {
    expect(
      hasValidConsent({
        accepted_terms_version: CURRENT_TERMS_VERSION,
        accepted_privacy_version: CURRENT_PRIVACY_VERSION,
        accepted_terms_at: "2026-06-29T00:00:00Z",
        accepted_privacy_at: "2026-06-29T00:00:00Z",
      }),
    ).toBe(true);
  });
});

describe("isConsentRequiredError", () => {
  it("detects server-thrown consent_required messages", () => {
    expect(isConsentRequiredError({ message: "consent_required" })).toBe(true);
    expect(isConsentRequiredError({ message: "P0001: consent_required" })).toBe(true);
    expect(isConsentRequiredError({ details: "consent_required" })).toBe(true);
  });
  it("returns false for unrelated errors", () => {
    expect(isConsentRequiredError(null)).toBe(false);
    expect(isConsentRequiredError({ message: "network error" })).toBe(false);
  });
});

describe("consentFooterLine", () => {
  it("returns empty string when snapshot is missing", () => {
    expect(consentFooterLine(null)).toBe("");
    expect(consentFooterLine(undefined)).toBe("");
    expect(consentFooterLine({})).toBe("");
  });
  it("renders versions and timestamps when present", () => {
    const line = consentFooterLine({
      termsVersion: "2026-06-29",
      termsAt: "2026-06-29T00:00:00Z",
      privacyVersion: "2026-06-29",
      privacyAt: "2026-06-29T00:00:00Z",
    });
    expect(line).toContain("terms=2026-06-29");
    expect(line).toContain("privacy=2026-06-29");
    expect(line.startsWith("# Consent:")).toBe(true);
  });
});