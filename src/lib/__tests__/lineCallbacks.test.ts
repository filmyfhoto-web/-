import { describe, it, expect } from "vitest";
import {
  STAFF_CALLBACK_URLS,
  staffRedirectUri,
  describeLineAuthError,
  buildLineAuthorizeUrl,
  newProbeState,
  isProbeState,
  LINE_LOGIN_CHANNEL_ID,
} from "@/lib/lineCallbacks";

describe("lineCallbacks", () => {
  it("builds <origin>/staff without trailing slash issues", () => {
    expect(staffRedirectUri("https://www.filmyynatta.com")).toBe("https://www.filmyynatta.com/staff");
    expect(staffRedirectUri("https://staff.filmyynatta.com/")).toBe("https://staff.filmyynatta.com/staff");
  });

  it("covers both customer and staff hosts", () => {
    expect(STAFF_CALLBACK_URLS).toContain("https://www.filmyynatta.com/staff");
    expect(STAFF_CALLBACK_URLS).toContain("https://staff.filmyynatta.com/staff");
    for (const u of STAFF_CALLBACK_URLS) {
      expect(u.startsWith("https://")).toBe(true);
      expect(u.endsWith("/staff")).toBe(true);
    }
  });

  it("explains redirect_uri errors in Thai", () => {
    expect(describeLineAuthError("invalid_request", "redirect_uri is invalid")).toMatch(/Callback URL/);
    expect(describeLineAuthError("access_denied")).toMatch(/ยกเลิก/);
  });

  it("tags probe states so the callback never creates a session", () => {
    const s = newProbeState();
    expect(isProbeState(s)).toBe(true);
    expect(isProbeState("plainstate")).toBe(false);
    expect(isProbeState(null)).toBe(false);
    expect(newProbeState()).not.toBe(s);
  });

  it("builds a valid authorize URL", () => {
    const url = new URL(
      buildLineAuthorizeUrl({ redirectUri: "https://staff.filmyynatta.com/staff", state: "probe:abc" }),
    );
    expect(url.origin + url.pathname).toBe("https://access.line.me/oauth2/v2.1/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(LINE_LOGIN_CHANNEL_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("https://staff.filmyynatta.com/staff");
    expect(url.searchParams.get("state")).toBe("probe:abc");
    expect(url.searchParams.get("scope")).toBe("profile openid");
    expect(url.searchParams.get("nonce")).toBeTruthy();
  });
});