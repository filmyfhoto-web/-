import { describe, it, expect } from "vitest";
import { readFnError } from "../Staff";
import { friendlyAuthError } from "../../../../supabase/functions/_shared/authErrors.ts";

describe("staff account error reporting", () => {
  it("never labels a weak password as an email problem", () => {
    const msg = friendlyAuthError("Password is known to be weak and easy to guess, please choose a different one.");
    expect(msg).toMatch(/รหัสผ่าน/);
    expect(msg).not.toMatch(/อีเมล/);
  });
  it("keeps the email message for real email rejections", () => {
    expect(friendlyAuthError("Email address is invalid")).toMatch(/อีเมล/);
  });
  it("reads the real reason out of a non-2xx edge function response", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "รหัสผ่านนี้ถูกจัดว่าคาดเดาง่าย" }) } };
    expect(await readFnError(err)).toBe("รหัสผ่านนี้ถูกจัดว่าคาดเดาง่าย");
  });
  it("falls back to the raw message when there is no body", async () => {
    expect(await readFnError({ message: "network error" })).toBe("network error");
  });
});
