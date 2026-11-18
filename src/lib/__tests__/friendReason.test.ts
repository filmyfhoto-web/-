import { describe, it, expect } from "vitest";
import { friendReasonTH } from "@/lib/lineFriend";

describe("friendReasonTH", () => {
  it("returns null for ok/confirmed", () => {
    expect(friendReasonTH("ok")).toBeNull();
    expect(friendReasonTH("confirmed")).toBeNull();
    expect(friendReasonTH(null)).toBeNull();
  });

  it("maps LINE API HTTP failures to Thai messages", () => {
    expect(friendReasonTH("line_api_401")).toMatch(/401/);
    expect(friendReasonTH("line_api_403")).toMatch(/403/);
    expect(friendReasonTH("line_api_429")).toMatch(/429/);
    expect(friendReasonTH("line_api_5xx", 502)).toMatch(/502/);
  });

  it("maps config/network/auth reasons", () => {
    expect(friendReasonTH("config_missing")).toMatch(/LINE_CHANNEL_ACCESS_TOKEN/);
    expect(friendReasonTH("network_error")).toMatch(/เชื่อมต่อ/);
    expect(friendReasonTH("forbidden")).toMatch(/สิทธิ์/);
    expect(friendReasonTH("unauthorized")).toMatch(/เซสชัน/);
    expect(friendReasonTH("not_friend")).toMatch(/OA/);
  });

  it("returns generic fallback for unknown reasons", () => {
    expect(friendReasonTH("weird_code")).toMatch(/weird_code/);
  });
});