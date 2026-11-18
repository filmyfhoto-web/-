import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("supabase/functions/guest-order-submit/index.ts", "utf8");

describe("สั่งซื้อผ่าน LINE แล้วผูกบัญชีอัตโนมัติ", () => {
  it("ผูกเฉพาะตัวตนที่ผ่าน verifyLineIdentity และไม่รับ line_user_id จาก body", () => {
    expect(source).toContain("const identity = await verifyLineIdentity(req, body ?? {});");
    expect(source).toContain("verifiedLineUserId = identity.line_user_id;");
    expect(source).toContain("if (verifiedLineUserId)");
    expect(source).not.toMatch(/body\??\.?line_user_id/);
  });

  it("บันทึกชื่อและเบอร์จาก checkout และใช้ upsert ป้องกันแถวซ้ำ", () => {
    expect(source).toContain('from("line_account_links")');
    expect(source).toContain("phone: existingLink?.phone || phone");
    expect(source).toContain("display_name: existingLink?.display_name || name");
    expect(source).toContain('{ onConflict: "line_user_id" }');
  });

  it("ไม่เปิดบัญชีที่แอดมินยกเลิกผูกไว้กลับเอง", () => {
    expect(source).toContain('existingLink?.customer_source !== "admin_unbound"');
  });
});
