// ข้อความต้อนรับหลังลูกค้ากด "เพิ่มเพื่อน" (follow event)
//
// Pure builder — ไม่ยุ่งกับ network/DB เพื่อให้เทสต์ได้ตรง ๆ
// จุดประสงค์: ให้ลูกค้ากดไปต่อได้จากในแชทเลย (สั่งสินค้า / งานของฉัน)
// ไม่เกี่ยวกับ logic ผูกบัญชี หรือ auto-redirect ฝั่งเว็บ

const PLUM = "#6B2D5C";
const CREAM = "#FFF8F0";

export const FOLLOW_SHOP_LABEL = "สั่งสินค้า";
export const FOLLOW_ACCOUNT_LABEL = "งานของฉัน";

export function followWelcomeLinks(origin: string) {
  const base = String(origin || "").replace(/\/+$/, "");
  return {
    shopUrl: `${base}/shop`,
    accountUrl: `${base}/my-account`,
  };
}

/** ปุ่มลัดแบบ quick reply — กดได้แม้เลื่อนแชทผ่านการ์ดไปแล้ว */
export function buildFollowWelcomeQuickReply(origin: string) {
  const { shopUrl, accountUrl } = followWelcomeLinks(origin);
  return {
    items: [
      { type: "action", action: { type: "uri", label: FOLLOW_SHOP_LABEL, uri: shopUrl } },
      { type: "action", action: { type: "uri", label: FOLLOW_ACCOUNT_LABEL, uri: accountUrl } },
    ],
  };
}

/** ข้อความต้อนรับ (Flex การ์ด + quick reply) — ส่งได้เลยด้วย replyLineMessages */
export function buildFollowWelcomeMessages(origin: string): unknown[] {
  const { shopUrl, accountUrl } = followWelcomeLinks(origin);
  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      backgroundColor: CREAM,
      contents: [
        { type: "text", text: "ขอบคุณที่เพิ่มเพื่อนกับร้าน", weight: "bold", size: "lg", color: PLUM, wrap: true },
        {
          type: "text",
          text: "เลือกเมนูด้านล่างเพื่อเริ่มใช้งานได้เลยค่ะ",
          size: "sm",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          height: "sm",
          color: PLUM,
          action: { type: "uri", label: FOLLOW_SHOP_LABEL, uri: shopUrl },
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: { type: "uri", label: FOLLOW_ACCOUNT_LABEL, uri: accountUrl },
        },
      ],
    },
  };

  return [
    {
      type: "flex",
      altText: "ขอบคุณที่เพิ่มเพื่อนกับร้าน — สั่งสินค้า หรือ ดูงานของฉัน",
      contents: bubble,
      quickReply: buildFollowWelcomeQuickReply(origin),
    },
  ];
}
