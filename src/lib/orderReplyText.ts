import { fmtTHB } from "./format";

export const TEMPLATE_KEYS = [
  "received", "quoting", "total", "ready", "moreinfo", "cancel",
  "pickup", "shipped", "paid", "followup",
] as const;
export type TemplateKey = typeof TEMPLATE_KEYS[number];

export const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  received: "รับออเดอร์แล้ว",
  quoting: "รอเสนอราคา",
  total: "แจ้งยอดรวม",
  ready: "สินค้าพร้อมรับ",
  moreinfo: "ขอข้อมูลเพิ่มเติม",
  cancel: "ยกเลิกออเดอร์",
  pickup: "นัดรับสินค้า",
  shipped: "แจ้งเลขพัสดุ",
  paid: "ยืนยันการชำระเงิน",
  followup: "ติดตามลูกค้า",
};

function customerName(order: any): string {
  return (
    order?.guest_name ||
    order?.organizations?.contact_name ||
    order?.organizations?.name ||
    "ลูกค้า"
  );
}

function formatItemsBlock(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  const lines: string[] = ["รายการสินค้า:"];
  items.forEach((it, i) => {
    const name = it?.product_name || it?.name || "-";
    const qty = Number(it?.qty ?? 0);
    const unit = it?.unit ? ` ${it.unit}` : "";
    const price = Number(it?.price ?? 0);
    lines.push("");
    lines.push(`${i + 1}) ${name}`);
    lines.push(`   จำนวน: ${qty}${unit}`);
    if (price > 0) lines.push(`   ราคา: ${fmtTHB(price)}`);
  });
  return lines.join("\n");
}

/**
 * Builds a Thai reply message that reads naturally when pasted into LINE.
 * Uses real `\n` line breaks so clipboard paste preserves formatting.
 */
export function buildOrderReplyText(
  order: any,
  items: any[],
  total: number,
  key: TemplateKey,
): string {
  const no = order?.order_no ?? "-";
  const name = customerName(order);
  const amount = fmtTHB(Number(total || 0));
  const itemsBlock = formatItemsBlock(items);
  const totalLine = Number(total) > 0 ? `\n\nยอดรวม: ${amount}` : "";
  const itemsSection = itemsBlock ? `\n\n${itemsBlock}${totalLine}` : "";

  switch (key) {
    case "received":
      return `สวัสดีค่ะคุณ${name} 🙏\nทางร้านนัฐภรณ์ได้รับออเดอร์ของท่านเรียบร้อยแล้วนะคะ\nเลขออเดอร์: ${no}${itemsSection}\n\nทางร้านจะตรวจสอบและติดต่อกลับอีกครั้งค่ะ`;
    case "quoting":
      return `เรียนคุณ${name}\nทางร้านกำลังจัดเตรียมใบเสนอราคาสำหรับออเดอร์ ${no} อยู่ค่ะ${itemsSection}\n\nจะแจ้งราคากลับให้โดยเร็วที่สุดค่ะ 🙏`;
    case "total":
      return `เรียนคุณ${name}\nทางร้านขอแจ้งยอดรวมสำหรับออเดอร์ ${no} ค่ะ${itemsSection}\n\nรบกวนยืนยันคำสั่งซื้อกลับด้วยนะคะ ขอบคุณค่ะ 🙏`;
    case "ready":
      return `เรียนคุณ${name}\nสินค้าตามออเดอร์ ${no} พร้อมให้เข้ารับ / จัดส่งแล้วค่ะ${itemsSection}\n\nรบกวนแจ้งวันเวลาที่สะดวกกลับมาที่ร้านด้วยนะคะ 🙏`;
    case "moreinfo":
      return `เรียนคุณ${name}\nเกี่ยวกับออเดอร์ ${no} ทางร้านขอรบกวนสอบถามข้อมูลเพิ่มเติมค่ะ\n- \n\nขอบคุณมากค่ะ 🙏`;
    case "cancel":
      return `เรียนคุณ${name}\nต้องขออภัยเป็นอย่างสูงค่ะ\nออเดอร์ ${no} จำเป็นต้องยกเลิก เนื่องจาก ...\n\nหากมีข้อสงสัยสามารถติดต่อกลับได้ค่ะ 🙏`;
    case "pickup":
      return `เรียนคุณ${name}\nออเดอร์ ${no} พร้อมให้เข้ารับแล้วค่ะ${itemsSection}\n\nวัน/เวลานัดรับ: ____\nสถานที่: ร้านนัฐภรณ์\nรบกวนยืนยันเวลาที่สะดวกกลับมาด้วยนะคะ 🙏`;
    case "shipped":
      return `เรียนคุณ${name}\nออเดอร์ ${no} จัดส่งเรียบร้อยแล้วค่ะ\nขนส่ง: ____ (Kerry / Flash / ไปรษณีย์)\nเลขพัสดุ: ____\n\nสามารถตรวจสอบสถานะได้ตามลิงก์ของขนส่งค่ะ 🙏`;
    case "paid":
      return `เรียนคุณ${name}\nทางร้านได้รับยอดชำระ ${amount} สำหรับออเดอร์ ${no} เรียบร้อยแล้วค่ะ${itemsSection}\n\nขอบคุณมากค่ะ 🙏`;
    case "followup":
      return `เรียนคุณ${name}\nรบกวนสอบถามความคืบหน้าเกี่ยวกับออเดอร์ ${no} ค่ะ\nยังสนใจสั่งซื้ออยู่ไหมคะ หากต้องการปรับรายการสามารถแจ้งกลับได้เลยค่ะ 🙏`;
    default:
      return "";
  }
}