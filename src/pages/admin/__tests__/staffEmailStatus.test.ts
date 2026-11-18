import { describe, it, expect } from "vitest";
import { explainEmailError } from "../Staff";

describe("explainEmailError", () => {
  it("explains the sender-domain failure seen in production logs", () => {
    expect(
      explainEmailError('Email API error: 403 {"type":"no_matching_sender","title":"No sender domain matches"}'),
    ).toBe("โดเมนผู้ส่งยังไม่ถูกตั้งค่า/ยืนยัน");
  });
  it("explains rate limits", () => {
    expect(explainEmailError("429 over_email_send_rate_limit")).toMatch(/โควตา/);
  });
  it("falls back for unknown errors and truncates long ones", () => {
    expect(explainEmailError(null)).toBe("ไม่ทราบสาเหตุ");
    expect(explainEmailError("x".repeat(300)).length).toBeLessThanOrEqual(121);
  });
});
