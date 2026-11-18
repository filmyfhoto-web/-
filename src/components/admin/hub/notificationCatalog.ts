/**
 * พจนานุกรมแจ้งเตือนของศูนย์รวมงานลูกค้า — ฟังก์ชันบริสุทธิ์ทั้งหมด (ทดสอบได้)
 * ไม่มีการเปลี่ยน business logic: อ่านจากตาราง `notifications` เดิมเท่านั้น
 */

export type HubGroup = "order" | "requisition" | "line" | "system";

export interface NotiLike {
  id?: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  ref_id: string | null;
  read?: boolean | null;
  created_at?: string;
}

export interface CatalogEntry {
  group: HubGroup;
  /** ชื่อหมวดสั้น ๆ ที่แสดงเป็นป้าย */
  badge: string;
  /** ชื่อชนิดแจ้งเตือนแบบภาษาคน */
  label: string;
  /** อธิบายว่าแจ้งเตือนนี้เกิดจากอะไร / ต้องทำอะไรต่อ */
  hint: string;
}

const CATALOG: Record<string, CatalogEntry> = {
  new_order: {
    group: "order", badge: "ออเดอร์ใหม่", label: "มีออเดอร์ใหม่เข้ามา",
    hint: "ตรวจสอบรายการและยืนยันออเดอร์",
  },
  new_customer_order: {
    group: "order", badge: "ออเดอร์ใหม่", label: "ออเดอร์จากลูกค้ารอยืนยัน",
    hint: "ตรวจสอบชื่อลูกค้าก่อนรับออเดอร์",
  },
  order_status_change: {
    group: "order", badge: "ออเดอร์", label: "สถานะออเดอร์เปลี่ยน",
    hint: "เปิดดูออเดอร์เพื่อตรวจสถานะล่าสุด",
  },
  new_requisition: {
    group: "requisition", badge: "ใบเบิก", label: "มีใบเขียนเบิกใหม่",
    hint: "ตรวจรายการและอนุมัติใบเบิก",
  },
  requisition_submitted: {
    group: "requisition", badge: "ใบเบิก", label: "ใบเขียนเบิกส่งเข้ามาแล้ว",
    hint: "ตรวจรายการและอนุมัติใบเบิก",
  },
  line_login_failure: {
    group: "line", badge: "LINE OA", label: "ลูกค้าเข้าสู่ระบบไม่สำเร็จ",
    hint: "ลิงก์เข้าสู่ระบบมีปัญหา ส่งลิงก์ใหม่ให้ลูกค้า",
  },
  line_link_failure: {
    group: "line", badge: "LINE OA", label: "เชื่อมบัญชีลูกค้าไม่สำเร็จ",
    hint: "เลือกชื่อลูกค้าจากรายชื่อ LINE OA เพื่อจับคู่บัญชี",
  },
  new_signup: {
    group: "line", badge: "ลูกค้าใหม่", label: "มีลูกค้าสมัครใหม่",
    hint: "ตรวจข้อมูลลูกค้าและจับคู่กับ LINE OA",
  },
  new_customer: {
    group: "line", badge: "ลูกค้าใหม่", label: "มีลูกค้าใหม่ในระบบ",
    hint: "ตรวจข้อมูลลูกค้าและจับคู่กับ LINE OA",
  },
  customer_message: {
    group: "line", badge: "LINE OA", label: "ลูกค้าทักเข้ามาใน LINE OA",
    hint: "เปิดแชทเพื่อตอบกลับลูกค้า",
  },
  staff_line_approval: {
    group: "system", badge: "พนักงาน", label: "พนักงานขอสิทธิ์เข้าใช้งาน",
    hint: "ตรวจรายชื่อและอนุมัติสิทธิ์พนักงาน",
  },
  staff_line_approved: {
    group: "system", badge: "พนักงาน", label: "อนุมัติสิทธิ์พนักงานแล้ว",
    hint: "ดูรายชื่อพนักงานที่ได้รับสิทธิ์",
  },
  webhook_failure: {
    group: "system", badge: "ระบบ", label: "การเชื่อมต่อ LINE ขัดข้อง",
    hint: "เป็นเรื่องทางเทคนิค ตรวจได้ที่หน้าตั้งค่า LINE",
  },
  nw_wo_approved: {
    group: "system", badge: "งานปริ้น", label: "อนุมัติใบสั่งงานแล้ว",
    hint: "เปิดใบสั่งงานเพื่อดูรายละเอียด",
  },
  nw_status_change: {
    group: "system", badge: "งานปริ้น", label: "สถานะใบสั่งงานเปลี่ยน",
    hint: "เปิดใบสั่งงานเพื่อดูรายละเอียด",
  },
};

const FALLBACK: CatalogEntry = {
  group: "system", badge: "ระบบ", label: "แจ้งเตือนระบบ",
  hint: "เปิดดูรายละเอียดเพิ่มเติม",
};

export function catalogFor(type: string | null | undefined): CatalogEntry {
  const t = String(type ?? "").toLowerCase();
  if (CATALOG[t]) return CATALOG[t];
  if (t.includes("requisition") || t.includes("เบิก")) {
    return { group: "requisition", badge: "ใบเบิก", label: "งานใบเขียนเบิก", hint: "เปิดดูใบเขียนเบิก" };
  }
  if (t.includes("order") || t.includes("po") || t.includes("purchase")) {
    return { group: "order", badge: "ออเดอร์", label: "งานออเดอร์", hint: "เปิดดูออเดอร์" };
  }
  if (t.includes("line") || t.includes("chat") || t.includes("message") || t.includes("inbox")) {
    return { group: "line", badge: "LINE OA", label: "งาน LINE OA", hint: "เปิดดูรายละเอียด LINE OA" };
  }
  return FALLBACK;
}

export function groupOf(type: string | null | undefined): HubGroup {
  return catalogFor(type).group;
}

/** สีประจำหมวด (แถบซ้าย / ไอคอน / ป้าย) */
export const GROUP_STYLE: Record<HubGroup, { bar: string; chip: string; icon: string }> = {
  order: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "bg-emerald-100 text-emerald-600" },
  requisition: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200", icon: "bg-amber-100 text-amber-600" },
  line: { bar: "bg-sky-500", chip: "bg-sky-50 text-sky-700 border-sky-200", icon: "bg-sky-100 text-sky-600" },
  system: { bar: "bg-primary", chip: "bg-accent text-primary border-primary/20", icon: "bg-accent text-primary" },
};

/** รหัสข้อผิดพลาดดิบ → ข้อความที่พนักงานเข้าใจ */
const ERROR_TEXT: Record<string, string> = {
  state_invalid_or_expired: "ลิงก์เข้าสู่ระบบหมดอายุ กรุณาส่งลิงก์ใหม่ให้ลูกค้า",
  token_exchange_failed: "ระบบ LINE ปฏิเสธการเข้าสู่ระบบ ให้ลูกค้าลองใหม่อีกครั้ง",
  profile_fetch_failed: "ดึงโปรไฟล์ลูกค้าจาก LINE ไม่สำเร็จ ให้ลองใหม่อีกครั้ง",
  missing_code: "ลิงก์เข้าสู่ระบบไม่สมบูรณ์ กรุณาส่งลิงก์ใหม่",
  config_missing: "ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE ให้ครบ",
  not_friend: "ลูกค้ายังไม่ได้เพิ่มเพื่อน LINE OA",
  signature_invalid: "การเชื่อมต่อ LINE ไม่ผ่านการตรวจสอบความปลอดภัย",
};

/** true = ข้อความเป็นรหัสเทคนิคล้วน ไม่ควรโชว์ดิบ ๆ ในหน้าหลัก */
export function isRawErrorCode(body: string | null | undefined): boolean {
  const s = String(body ?? "").trim();
  if (!s) return false;
  const head = s.split(/[\s·]/)[0];
  return !!ERROR_TEXT[head] || /^[a-z0-9]+(_[a-z0-9]+){1,}$/.test(head);
}

/** แปลงข้อความให้อ่านง่าย ถ้าเป็นรหัสเทคนิคที่รู้จักจะแปลเป็นภาษาไทย */
export function friendlyBody(body: string | null | undefined, hint = ""): string {
  const s = String(body ?? "").trim();
  if (!s || s === "—") return hint;
  const head = s.split(/[\s·]/)[0];
  if (ERROR_TEXT[head]) return ERROR_TEXT[head];
  if (isRawErrorCode(s)) return hint || "พบข้อผิดพลาดทางเทคนิค กดดูรายละเอียด";
  return s;
}

export interface NotiAction { label: string; to: string; variant?: "primary" | "secondary" }

/** ปุ่มลัดของแต่ละแจ้งเตือน (ปุ่มหลักอยู่ท้ายสุดเสมอ) */
export function resolveActions(n: NotiLike): NotiAction[] {
  const { group } = catalogFor(n.type);
  const link = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null;
  const type = String(n.type ?? "").toLowerCase();

  if (group === "order") {
    const actions: NotiAction[] = [];
    if (type === "new_customer_order") {
      actions.push({ label: "จับคู่ลูกค้า", to: "/admin/work-docs?match=1", variant: "secondary" });
    }
    actions.push({ label: "เปิดออเดอร์", to: link ?? "/admin/customer-purchase-orders", variant: "primary" });
    return actions;
  }
   if (group === "requisition") {
     const requisitionLink = link ?? (n.ref_id ? `/admin/work-docs?filter=requisition&kind=requisition&id=${encodeURIComponent(n.ref_id)}` : "/admin/work-docs?filter=requisition");
     return [{ label: "ดูใบเบิก", to: requisitionLink, variant: "primary" }];
   }
  if (group === "line") {
    if (type === "line_login_failure") {
      return [
        { label: "ดูรายละเอียด", to: "/admin/line-notify-status", variant: "secondary" },
        { label: "ส่งลิงก์ใหม่", to: "/admin/work-docs?match=1", variant: "primary" },
      ];
    }
    return [{ label: "จับคู่ลูกค้า", to: link ?? "/admin/work-docs?match=1", variant: "primary" }];
  }
  if (type.startsWith("staff_line")) {
    return [{ label: "อนุมัติพนักงาน", to: link ?? "/admin/staff-line", variant: "primary" }];
  }
  return [{ label: "ดูรายละเอียด", to: link ?? "/admin/line-notify-status", variant: "primary" }];
}

/** แจ้งเตือนทางเทคนิคที่มีจำนวนมากและไม่ใช่งานที่ต้องลงมือ */
export function isNoise(type: string | null | undefined): boolean {
  const t = String(type ?? "").toLowerCase();
  return t === "webhook_failure";
}

/** ค้นด้วยชื่อลูกค้าหรือเลขออเดอร์ */
export function matchesQuery(n: NotiLike, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [n.title, n.body, n.ref_id, n.link, catalogFor(n.type).label]
    .some((v) => String(v ?? "").toLowerCase().includes(s));
}

/** เวลาแบบอ่านง่าย: วันนี้ / เมื่อวาน / วันที่ */
export function friendlyTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff === 0) return `วันนี้ ${time} น.`;
  if (diff === 1) return `เมื่อวาน ${time} น.`;
  return `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${time} น.`;
}

/** ช่วงวันที่ที่ให้เลือกกรอง */
export type DateRange = "today" | "7d" | "30d" | "all";

export const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "7d", label: "7 วัน" },
  { key: "30d", label: "30 วัน" },
  { key: "all", label: "ทั้งหมด" },
];

/** true = แจ้งเตือนอยู่ในช่วงวันที่ที่เลือก */
export function withinRange(iso: string | null | undefined, range: DateRange, now: Date = new Date()): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff < 0) return true; // เผื่อเวลาเครื่องคลาดเคลื่อน
  if (range === "today") return diff === 0;
  if (range === "7d") return diff <= 6;
  return diff <= 29;
}

/** สถานะการอ่าน */
export type ReadStatus = "all" | "unread" | "read";

export const READ_STATUSES: { key: ReadStatus; label: string }[] = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "unread", label: "ยังไม่อ่าน" },
  { key: "read", label: "อ่านแล้ว" },
];

export function matchesStatus(n: NotiLike, status: ReadStatus): boolean {
  if (status === "all") return true;
  return status === "read" ? !!n.read : !n.read;
}

/** ลิงก์ที่เกี่ยวข้องทั้งหมดของแจ้งเตือน (ใช้ในหน้ารายละเอียด) */
export function relatedLinks(n: NotiLike): NotiAction[] {
  const out: NotiAction[] = [];
  const link = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null;
  if (link) out.push({ label: "เปิดรายการที่แจ้งมา", to: link, variant: "primary" });
   out.push({ label: "คำสั่งซื้อ", to: "/admin/work-docs?filter=order" });
   out.push({ label: "ใบเขียนเบิก", to: "/admin/work-docs?filter=requisition" });
   out.push({ label: "รายชื่อลูกค้า & LINE OA", to: "/admin/work-docs?match=1" });
  out.push({ label: "สถานะการแจ้งเตือน LINE", to: "/admin/line-notify-status" });
  return out;
}
