/**
 * ถังสถานะคำสั่งซื้อฝั่งลูกค้า (4 ช่อง) — ใช้ร่วมกันระหว่างหน้า "บัญชีของฉัน"
 * (แสดง badge) และหน้า "ประวัติคำสั่งซื้อ" (ตัวกรอง) เพื่อให้ตัวเลขกับผลกรอง
 * ตรงกันเสมอ และผูกกับ workflow จริงของออเดอร์/เอกสาร ไม่ใช่ข้อมูลจำลอง
 */
export type CustomerOrderBucketKey = "all" | "pending" | "issued" | "received";

export interface CustomerOrder {
  status?: string | null;
  receipt_issued_at?: string | null;
  [k: string]: unknown;
}

export interface CustomerOrderBucket {
  key: CustomerOrderBucketKey;
  label: string;
  /** ไอคอนกำหนดที่ชั้น UI เพื่อให้ไฟล์นี้ทดสอบได้โดยไม่ต้องพึ่ง React */
  iconKey: "history" | "clock" | "fileCheck" | "packageCheck";
  match: (o: CustomerOrder) => boolean;
}

/** สถานะที่ถือว่า "ยังรอร้านดำเนินการ" */
const PENDING_STATUSES = new Set(["pending_quote", "quoted", "approved", "picking"]);

export const CUSTOMER_ORDER_BUCKETS: CustomerOrderBucket[] = [
  {
    key: "all",
    label: "ประวัติสั่งซื้อ",
    iconKey: "history",
    match: () => true,
  },
  {
    key: "pending",
    label: "รอดำเนินการ",
    iconKey: "clock",
    match: (o) => PENDING_STATUSES.has(String(o.status ?? "")),
  },
  {
    key: "issued",
    label: "เอกสารออกแล้ว",
    iconKey: "fileCheck",
    // ออกใบเสร็จ/เอกสารแล้วแต่ยังไม่ปิดงาน
    match: (o) => !!o.receipt_issued_at && String(o.status ?? "") !== "completed",
  },
  {
    key: "received",
    label: "ได้รับเอกสารแล้ว",
    iconKey: "packageCheck",
    match: (o) => String(o.status ?? "") === "completed",
  },
];

export function isBucketKey(v: unknown): v is CustomerOrderBucketKey {
  return typeof v === "string" && CUSTOMER_ORDER_BUCKETS.some((b) => b.key === v);
}

/**
 * ลำดับการแสดงผลบนการ์ด "คำสั่งซื้อของฉัน" (รอดำเนินการ → เอกสารออกแล้ว →
 * ได้รับเอกสารแล้ว → ประวัติสั่งซื้อ) แยกจากลำดับนิยามเพื่อไม่กระทบ logic เดิม
 */
export const CUSTOMER_ORDER_BUCKET_DISPLAY_ORDER: CustomerOrderBucketKey[] = [
  "pending", "issued", "received", "all",
];

export const CUSTOMER_ORDER_BUCKETS_DISPLAY: CustomerOrderBucket[] =
  CUSTOMER_ORDER_BUCKET_DISPLAY_ORDER.map(
    (k) => CUSTOMER_ORDER_BUCKETS.find((b) => b.key === k)!,
  );

export function getBucket(key: string | null | undefined): CustomerOrderBucket | null {
  return CUSTOMER_ORDER_BUCKETS.find((b) => b.key === key) ?? null;
}

/** นับจำนวนออเดอร์ในแต่ละถัง */
export function countBuckets(orders: CustomerOrder[]): Record<CustomerOrderBucketKey, number> {
  const out = {} as Record<CustomerOrderBucketKey, number>;
  for (const b of CUSTOMER_ORDER_BUCKETS) out[b.key] = orders.filter((o) => b.match(o)).length;
  return out;
}

/** กรองออเดอร์ตามถัง — คีย์ที่ไม่รู้จักถือว่าไม่กรอง */
export function filterByBucket<T extends CustomerOrder>(orders: T[], key: string | null | undefined): T[] {
  const b = getBucket(key);
  if (!b || b.key === "all") return orders;
  return orders.filter((o) => b.match(o));
}

/** แสดง badge เฉพาะเมื่อมากกว่า 0 และย่อเป็น 99+ */
export function formatBadgeCount(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}
