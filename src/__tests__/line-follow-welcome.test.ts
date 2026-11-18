import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildFollowWelcomeMessages,
  buildFollowWelcomeQuickReply,
  followWelcomeLinks,
} from "../../supabase/functions/line-webhook/followWelcome";

const ORIGIN = "https://www.filmyynatta.com";

describe("ข้อความต้อนรับหลังเพิ่มเพื่อน LINE", () => {
  it("มีลิงก์สั่งสินค้าและงานของฉันบน origin ที่ส่งเข้าไป", () => {
    expect(followWelcomeLinks(ORIGIN)).toEqual({
      shopUrl: `${ORIGIN}/shop`,
      accountUrl: `${ORIGIN}/my-account`,
    });
    expect(followWelcomeLinks(`${ORIGIN}/`).shopUrl).toBe(`${ORIGIN}/shop`);
  });

  it("การ์ดมีปุ่ม uri 2 ปุ่ม: สั่งสินค้า / งานของฉัน", () => {
    const [msg] = buildFollowWelcomeMessages(ORIGIN) as any[];
    expect(msg.type).toBe("flex");
    const buttons = msg.contents.footer.contents;
    expect(buttons).toHaveLength(2);
    expect(buttons[0].action).toMatchObject({ type: "uri", label: "สั่งสินค้า", uri: `${ORIGIN}/shop` });
    expect(buttons[1].action).toMatchObject({
      type: "uri",
      label: "งานของฉัน",
      uri: `${ORIGIN}/my-account`,
    });
  });

  it("แนบ quick reply ปุ่มเดียวกันมาด้วย", () => {
    const [msg] = buildFollowWelcomeMessages(ORIGIN) as any[];
    expect(msg.quickReply).toEqual(buildFollowWelcomeQuickReply(ORIGIN));
    const items = msg.quickReply.items;
    expect(items).toHaveLength(2);
    expect(items.every((i: any) => i.action.type === "uri")).toBe(true);
    expect(items.map((i: any) => i.action.label)).toEqual(["สั่งสินค้า", "งานของฉัน"]);
  });
});

describe("webhook follow branch", () => {
  const src = readFileSync("supabase/functions/line-webhook/index.ts", "utf8");

  it("ยังคง broadcast สัญญาณ realtime ให้เว็บเหมือนเดิม", () => {
    expect(src).toContain('broadcastLineLinked(lineUserId, "followed")');
  });

  it("ส่งข้อความต้อนรับพร้อมปุ่มลัดหลัง follow", () => {
    expect(src).toContain("buildFollowWelcomeMessages");
    expect(src).toContain("followWelcome.ts");
  });
});
