/**
 * การ์ด Flex "อ่านข้อมูลจากไฟล์แล้ว" สำหรับกลุ่ม LINE (แบ่งหน้าได้)
 *
 * รอบนี้เป็น "โค้ด + สัญญา" เท่านั้น ยังไม่ deploy และ webhook ยังไม่เรียกใช้
 * ปุ่มเปลี่ยนหน้าเป็น postback (ไม่ส่ง URL ดิบ) รูปแบบ: intake_ocr:<sessionId>:<page>
 */
export const INTAKE_OCR_POSTBACK = "intake_ocr";

/**
 * การ์ดเดียว "รับงานใหม่" — ไม่ถามทีละข้อความ ไม่แบ่งหน้า
 * ปุ่มหลักเปิดฟอร์มรับงานเดิมด้วย secure URL (action uri เท่านั้น) + ปุ่มยกเลิกเป็น postback
 */
export interface SingleCardLine { no: number; label: string; value: string; found: boolean }

export interface IntakeSingleCardInput {
  sessionId: string;
  lines: SingleCardLine[];
  reviewCount: number;
  formUrl: string;
  /** แสดงป้าย "อ่านข้อมูลจากไฟล์แล้ว" เมื่อการ์ดมาจากไฟล์แนบ */
  fromFile?: boolean;
}

export function buildIntakeSingleCardFlex(input: IntakeSingleCardInput) {
  return {
    type: "flex",
    altText: "รับงานใหม่",
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "รับงานใหม่", weight: "bold", size: "lg", color: "#0F766E" },
          ...(input.fromFile
            ? [{ type: "text", text: "อ่านข้อมูลจากไฟล์แล้ว", size: "xs", color: "#0F766E" }]
            : []),
          ...input.lines.slice(0, 4).map((l) => ({
            type: "text",
            text: `${l.no}. ${l.label}: ${l.value}`,
            size: "sm", wrap: true,
            color: l.found ? "#374151" : "#9CA3AF",
          })),
          ...(input.reviewCount > 0
            ? [{
                type: "text",
                text: `มีข้อมูลให้ตรวจ ${input.reviewCount} จุด`,
                size: "xs", color: "#B45309", wrap: true, margin: "md",
              }]
            : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          {
            type: "button", style: "primary", height: "sm", color: "#0F766E",
            action: { type: "uri", label: "เปิดฟอร์มสั่งงาน", uri: input.formUrl },
          },
          {
            type: "button", style: "link", height: "sm",
            action: {
              type: "postback", label: "ยกเลิก",
              data: `${INTAKE_OCR_POSTBACK}:${input.sessionId}:cancel`, displayText: "ยกเลิก",
            },
          },
        ],
      },
    },
  };
}

/** การ์ดสุดท้าย "รับงานสำเร็จ" — ส่งครั้งเดียวหลังยืนยันในฟอร์ม */
export interface IntakeSuccessInput {
  queueNo: string;
  jobOrderNo?: string | null;
  customerName: string;
  dueAt?: string | null;
}

export function buildIntakeSuccessFlex(input: IntakeSuccessInput) {
  return {
    type: "flex",
    altText: `รับงานสำเร็จ ${input.queueNo}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "รับงานสำเร็จ", weight: "bold", size: "lg", color: "#15803D" },
          { type: "text", text: `คิว: ${input.queueNo}`, size: "sm", wrap: true },
          ...(input.jobOrderNo
            ? [{ type: "text", text: `ใบสั่งจ้าง: ${input.jobOrderNo}`, size: "sm", wrap: true }]
            : []),
          { type: "text", text: `ลูกค้า: ${input.customerName}`, size: "sm", wrap: true },
          ...(input.dueAt
            ? [{ type: "text", text: `กำหนดรับ: ${input.dueAt}`, size: "sm", wrap: true }]
            : []),
        ],
      },
    },
  };
}

export interface OcrFlexLine { no: number; label: string; value: string; found: boolean; uncertain: boolean }
export interface OcrFlexPage { title: string; lines: OcrFlexLine[] }

export type IntakeOcrPostback =
  | { sessionId: string; action: "page"; page: number }
  | { sessionId: string; action: "cancel" };

export function parseIntakeOcrPostback(data: string): IntakeOcrPostback | null {
  const m = /^intake_ocr:([A-Za-z0-9_-]{6,64}):(\d{1,2}|cancel)$/.exec(data || "");
  if (!m) return null;
  if (m[2] === "cancel") return { sessionId: m[1], action: "cancel" };
  return { sessionId: m[1], action: "page", page: Number(m[2]) };
}

export interface OcrFlexInput {
  sessionId: string;
  page: number;
  pages: OcrFlexPage[];
  /** ลิงก์ฟอร์มรับงานที่ prefill จาก session (ใส่เฉพาะหน้าสุดท้าย) */
  formUrl: string;
}

/** สร้างการ์ดของหน้าที่ระบุ พร้อมปุ่ม ก่อนหน้า/ถัดไป/ยกเลิก */
export function buildIntakeOcrFlex(input: OcrFlexInput) {
  const total = input.pages.length;
  const page = Math.min(Math.max(input.page, 0), Math.max(0, total - 1));
  const p = input.pages[page];
  const last = page === total - 1;
  const pb = (label: string, target: number) => ({
    type: "button", style: "secondary", height: "sm",
    action: { type: "postback", label, data: `${INTAKE_OCR_POSTBACK}:${input.sessionId}:${target}`, displayText: label },
  });

  return {
    type: "flex",
    altText: "อ่านข้อมูลจากไฟล์แล้ว",
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
        contents: [
          { type: "text", text: "อ่านข้อมูลจากไฟล์แล้ว", weight: "bold", size: "md", color: "#0F766E" },
          { type: "text", text: `${p.title} · หน้า ${page + 1}/${total}`, size: "xs", color: "#6B7280" },
          ...p.lines.map((l) => ({
            type: "text",
            text: `${l.no}. ${l.label}: ${l.value}${l.uncertain ? " (ไม่แน่ใจ)" : ""}`,
            size: "sm", wrap: true,
            color: l.found ? (l.uncertain ? "#B45309" : "#374151") : "#9CA3AF",
          })),
          { type: "text", text: "ตรวจสอบและแก้ไขได้ในฟอร์มก่อนสร้างคิวค่ะ", size: "xs", color: "#9CA3AF", wrap: true, margin: "md" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              ...(page > 0 ? [pb("ก่อนหน้า", page - 1)] : []),
              ...(!last ? [pb("ถัดไป", page + 1)] : []),
            ],
          },
          ...(last
            ? [{
                type: "button", style: "primary", height: "sm", color: "#0F766E",
                action: { type: "uri", label: "เปิดฟอร์มตรวจสอบ", uri: input.formUrl },
              }]
            : []),
          {
            type: "button", style: "link", height: "sm",
            action: { type: "postback", label: "ยกเลิก", data: `${INTAKE_OCR_POSTBACK}:${input.sessionId}:cancel`, displayText: "ยกเลิก" },
          },
        ],
      },
    },
  };
}