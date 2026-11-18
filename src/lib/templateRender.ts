import { fmtTHB } from "./format";

/**
 * Render a reply template with real order data.
 * Supported variables:
 *   {{customer_name}}, {{order_number}}, {{order_items}}, {{total_amount}},
 *   {{payment_status}}, {{pickup_date}}, {{shop_name}}, {{admin_name}}
 *
 * Any unknown variable is left as-is so admins can spot typos.
 * `\n` is preserved so pasting into LINE keeps line breaks.
 */

export const TEMPLATE_VARIABLES = [
  { key: "customer_name", label: "ชื่อลูกค้า" },
  { key: "order_number", label: "เลขออเดอร์" },
  { key: "order_items", label: "รายการสินค้า" },
  { key: "total_amount", label: "ยอดรวม" },
  { key: "payment_status", label: "สถานะชำระเงิน" },
  { key: "pickup_date", label: "วันที่รับสินค้า" },
  { key: "shop_name", label: "ชื่อร้าน" },
  { key: "admin_name", label: "ชื่อแอดมิน" },
] as const;

const STATUS_TH: Record<string, string> = {
  pending: "รอดำเนินการ",
  quoted: "เสนอราคาแล้ว",
  approved: "ยืนยันแล้ว",
  paid: "ชำระเงินแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};

function customerNameOf(order: any): string {
  return (
    order?.guest_name ||
    order?.organizations?.contact_name ||
    order?.organizations?.name ||
    "ลูกค้า"
  );
}

function formatItemsList(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) return "-";
  return items
    .map((it) => {
      const name = it?.product_name || it?.name || "-";
      const qty = Number(it?.qty ?? 0);
      const unit = it?.unit ? ` ${it.unit}` : "";
      const price = Number(it?.price ?? 0);
      const line = price > 0 ? ` = ${fmtTHB(qty * price)}` : "";
      return `• ${name} × ${qty}${unit}${line}`;
    })
    .join("\n");
}

function formatDateTh(d: string | Date | null | undefined): string {
  if (!d) return "-";
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

export type RenderContext = {
  order: any;
  items: any[];
  total: number;
  shopName?: string;
  adminName?: string | null;
};

export function renderTemplate(content: string, ctx: RenderContext): string {
  const { order, items, total, shopName, adminName } = ctx;
  const values: Record<string, string> = {
    customer_name: customerNameOf(order),
    order_number: order?.order_no || order?.id || "-",
    order_items: formatItemsList(items),
    total_amount: total > 0 ? fmtTHB(total) : "-",
    payment_status:
      STATUS_TH[String(order?.status ?? "").toLowerCase()] ||
      order?.status ||
      "-",
    pickup_date: formatDateTh(order?.pickup_date || order?.expected_pickup_at),
    shop_name: shopName || "ร้านนัฐภรณ์ เชียงกลาง",
    admin_name: adminName || "แอดมิน",
  };
  return content.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => {
    const v = values[k.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

/** Preview rendering with a mock order — used by the template manager. */
export function renderPreview(content: string): string {
  return renderTemplate(content, {
    order: {
      order_no: "GO-2601-0123",
      guest_name: "คุณสมชาย ใจดี",
      status: "quoted",
      pickup_date: new Date().toISOString(),
    },
    items: [
      { product_name: "กระดาษการ์ดสีขาว 150 แกรม", qty: 2, unit: "แพ็ค", price: 125 },
      { product_name: "ปริ้นงาน A4 สี", qty: 10, unit: "แผ่น", price: 10 },
    ],
    total: 350,
  });
}