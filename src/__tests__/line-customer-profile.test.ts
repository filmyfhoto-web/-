import { describe, it, expect } from "vitest";
import {
  isSyntheticLineEmail,
  realEmail,
  profileInitial,
  safePictureUrl,
  NO_EMAIL_PLACEHOLDER,
} from "@/lib/lineProfile";

describe("LINE customer profile mapping", () => {
  it("treats the LINE auth identifier as NOT an email", () => {
    expect(isSyntheticLineEmail("line.u4f9825c8c6430b03ed959b81ebb9f07e@line-login.local")).toBe(true);
    expect(realEmail("line.u4f9825c8c6430b03ed959b81ebb9f07e@line-login.local")).toBeNull();
  });

  it("keeps real emails", () => {
    expect(isSyntheticLineEmail("filmy.fhoto@gmail.com")).toBe(false);
    expect(realEmail("  filmy.fhoto@gmail.com ")).toBe("filmy.fhoto@gmail.com");
    expect(realEmail(null)).toBeNull();
    expect(NO_EMAIL_PLACEHOLDER).toMatch(/อีเมล/);
  });

  it("falls back to a name initial when LINE has no picture", () => {
    expect(profileInitial("FILM")).toBe("F");
    expect(profileInitial("ครูพอลลี่")).toBe("ค");
    expect(profileInitial("")).toBe("?");
    expect(profileInitial(null)).toBe("?");
  });

  it("only renders https LINE avatars", () => {
    expect(safePictureUrl("https://profile.line-scdn.net/abc")).toBe("https://profile.line-scdn.net/abc");
    expect(safePictureUrl("http://evil.example/x")).toBeNull();
    expect(safePictureUrl("javascript:alert(1)")).toBeNull();
    expect(safePictureUrl(null)).toBeNull();
  });
});
