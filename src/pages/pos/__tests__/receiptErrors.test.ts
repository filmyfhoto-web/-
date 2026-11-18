import { describe, it, expect } from "vitest";
import { classifyReceiptError } from "../PosReceiptPrint";
import { mapFilmShopRole } from "@/film-shop/hooks/useUserRole";

describe("classifyReceiptError", () => {
  it("treats RLS/permission failures as denied, never not-found", () => {
    expect(classifyReceiptError({ code: "42501", message: "permission denied for table pos_receipts" })).toBe("denied");
    expect(classifyReceiptError({ status: 403, message: "forbidden" })).toBe("denied");
    expect(classifyReceiptError({ message: "new row violates row-level security policy" })).toBe("denied");
  });

  it("detects an expired session", () => {
    expect(classifyReceiptError({ status: 401, message: "JWT expired" })).toBe("expired");
  });

  it("keeps schema/query errors distinct from not-found", () => {
    expect(classifyReceiptError({ code: "42703", message: 'column "nope" does not exist' })).toBe("query");
    expect(classifyReceiptError(null)).toBe("not_found");
  });

  it("detects network failures", () => {
    expect(classifyReceiptError({ message: "TypeError: Failed to fetch" })).toBe("offline");
  });
});

describe("mapFilmShopRole", () => {
  it("treats owner as admin", () => {
    expect(mapFilmShopRole(["owner"])).toBe("admin");
    expect(mapFilmShopRole(["admin"])).toBe("admin");
    expect(mapFilmShopRole(["stock_staff", "photo_staff"])).toBe("staff");
    expect(mapFilmShopRole(["customer"])).toBe(null);
    expect(mapFilmShopRole(["stock_staff", "owner"])).toBe("admin");
  });
});
