/**
 * การ์ดตอบกลับของ “ม่วงจดให้” (LINE Flex)
 * — ใช้กับผลลัพธ์คำสั่งบัญชี: รอยืนยัน/บันทึกแล้ว, สรุปวันนี้, รับมัดจำ, แก้ไข/ยกเลิก
 * รูปแบบ: การ์ดขาว หัวเรื่องตัวหนา ตามด้วยรายการบรรทัด และปุ่มลัดด้านล่าง
 */
export type NattaCardTone = "income" | "expense" | "info" | "warn";

export interface NattaCardButton {
  label: string;
  text: string;
  style?: "primary" | "secondary";
  /** ถ้ากำหนด = กดปุ่มแล้วเปิดคีย์บอร์ดพร้อมข้อความตั้งต้น (ผู้ใช้พิมพ์แค่ตัวเลข) */
  fillInText?: string;
  /** postback data — ผูกปุ่มกับร่างที่รอยืนยันใบนั้น ๆ โดยเฉพาะ */
  data?: string;
}


export interface NattaCardInput {
  title: string;
  tone?: NattaCardTone;
  rows?: Array<{ label?: string; value: string }>;
  note?: string;
  buttons?: NattaCardButton[];
  altText?: string;
}

const TONE_COLOR: Record<NattaCardTone, string> = {
  income: "#0F7B5F",
  expense: "#C0392B",
  info: "#102A43",
  warn: "#B7791F",
};

export function buildNattaCardFlex(input: NattaCardInput) {
  const color = TONE_COLOR[input.tone ?? "info"];
  const bodyContents: unknown[] = [
    {
      type: "text",
      text: input.title,
      weight: "bold",
      size: "lg",
      color,
      wrap: true,
    },
  ];

  for (const row of input.rows ?? []) {
    bodyContents.push({
      type: "box",
      layout: "baseline",
      spacing: "sm",
      contents: [
        ...(row.label
          ? [{ type: "text", text: row.label, size: "sm", color: "#7C8B9A", flex: 3, wrap: true }]
          : []),
        {
          type: "text",
          text: row.value,
          size: "sm",
          color: "#102A43",
          flex: row.label ? 7 : 10,
          wrap: true,
        },
      ],
    });
  }

  if (input.note) {
    bodyContents.push({
      type: "text",
      text: input.note,
      size: "xs",
      color: "#7C8B9A",
      wrap: true,
      margin: "md",
    });
  }

  const buttons = (input.buttons ?? []).map((b) => ({
    type: "button",
    style: b.style === "secondary" ? "secondary" : "primary",
    height: "sm",
    color: b.style === "secondary" ? "#E3E8EF" : color,
    action: b.fillInText
      ? {
          type: "postback",
          label: b.label,
          data: `natta_fill:${b.label}`,
          inputOption: "openKeyboard",
          fillInText: b.fillInText,
        }
      : b.data
      ? {
          type: "postback",
          label: b.label,
          data: b.data,
          displayText: b.text,
        }
      : { type: "message", label: b.label, text: b.text },

  }));

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "18px",
      backgroundColor: "#FFFFFF",
      contents: bodyContents,
    },
    ...(buttons.length
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "14px",
            contents: buttons,
          },
        }
      : {}),
  };
}

/** ห่อเป็น message object พร้อมส่ง */
export function nattaFlexMessage(input: NattaCardInput) {
  return {
    type: "flex",
    altText: input.altText || input.title,
    contents: buildNattaCardFlex(input),
  };
}
