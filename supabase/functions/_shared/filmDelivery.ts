/**
 * Film Shop delivery notification helpers (pure, DB-client agnostic).
 *
 * ใช้ตาราง Film Shop จริงเท่านั้น: film_orders / film_customers
 * และ fallback ผู้รับ LINE ไปที่ line_account_links ด้วย customer_id เดียวกัน
 * ถ้าไม่พบ binding ที่ยืนยันตัวตนได้ → skipped (ห้ามเดา / ห้ามส่งผิดคน)
 */

export type FilmDeliveryStage = "ready" | "delivered";

/** stage ต้องตรงกับสถานะจริงใน DB เพื่อกัน client ปลอม event */
/** ระบบจริงบันทึกสถานะปิดงานเป็น "completed" (บางข้อมูลเก่าใช้ "delivered") */
export const FILM_STAGE_REQUIRED_STATUS: Record<FilmDeliveryStage, readonly string[]> = {
  ready: ["ready"],
  delivered: ["delivered", "completed"],
};

/** line_account_links ยังไม่มี source ของ Film Shop ในสคีมา จึงยอมรับเฉพาะค่าที่ปลอดภัยเหล่านี้ */
const ALLOWED_LINK_SOURCES = new Set(["film", "film_shop", null]);

export interface FilmOrderRow {
  id: string;
  order_no: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string | null;
}

export interface FilmRecipient {
  lineUserId: string | null;
  customerName: string;
  reason?: "no_line_binding";
}

type MaybeSingle<T> = Promise<{ data: T | null; error?: unknown }>;
// โครงสร้างขั้นต่ำที่ใช้จริง (ทั้ง supabase-js และ mock ใน test ใช้ได้)
export interface MinimalDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle?: () => MaybeSingle<any>;
        limit?: (n: number) => Promise<{ data: any[] | null; error?: unknown }>;
      };
    };
  };
}

export function isFilmDeliveryStage(v: unknown): v is FilmDeliveryStage {
  return v === "ready" || v === "delivered";
}

export async function loadFilmOrder(db: MinimalDb, id: string): Promise<FilmOrderRow | null> {
  const q = db.from("film_orders")
    .select("id, order_no, customer_id, customer_name, customer_phone, status")
    .eq("id", id);
  const { data } = await q.maybeSingle!();
  return (data as FilmOrderRow | null) ?? null;
}

export function filmStageMatchesStatus(stage: FilmDeliveryStage, status: string | null | undefined): boolean {
  return FILM_STAGE_REQUIRED_STATUS[stage].includes(String(status ?? ""));
}

export async function resolveFilmRecipient(db: MinimalDb, order: FilmOrderRow): Promise<FilmRecipient> {
  const fallbackName = order.customer_name || "ลูกค้า";
  if (!order.customer_id) return { lineUserId: null, customerName: fallbackName, reason: "no_line_binding" };

  const { data: cust } = await db.from("film_customers")
    .select("id, name, line_user_id")
    .eq("id", order.customer_id)
    .maybeSingle!();
  const customerName = (cust as any)?.name || fallbackName;
  const direct = (cust as any)?.line_user_id as string | undefined;
  if (direct) return { lineUserId: direct, customerName };

  // ข้อมูลเก่า: film_customers.line_user_id ว่าง → หา binding ที่ผูก customer_id เดียวกัน
  const { data: links } = await db.from("line_account_links")
    .select("line_user_id, customer_source, verified_at")
    .eq("customer_id", order.customer_id)
    .limit!(5);
  const hit = (links ?? []).find((l: any) =>
    l?.line_user_id && l?.verified_at && ALLOWED_LINK_SOURCES.has(l.customer_source ?? null));
  if (hit) return { lineUserId: hit.line_user_id as string, customerName };

  return { lineUserId: null, customerName, reason: "no_line_binding" };
}

export function buildFilmDeliveryText(
  stage: FilmDeliveryStage,
  order: Pick<FilmOrderRow, "order_no">,
  customerName: string,
): string {
  return [
    stage === "ready" ? "📦 งานพร้อมส่งมอบแล้วค่ะ" : "✅ ส่งมอบงานเรียบร้อยแล้วค่ะ",
    `เลขที่: ${order.order_no}`,
    `ลูกค้า: ${customerName}`,
    stage === "ready" ? "สถานะ: รอส่งมอบ" : "สถานะ: เสร็จสิ้น",
  ].join("\n");
}
