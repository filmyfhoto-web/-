import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readIdToken, hasVerifiableIdentity } from "@/lib/lineSession";
import type { CustomerOrder } from "@/lib/customerOrderBuckets";

export type MyOrder = CustomerOrder & {
  id: string;
  order_no?: string | null;
  total?: number | null;
  created_at?: string | null;
  paid_at?: string | null;
  receipt_no?: string | null;
  note?: string | null;
  notes_to_customer?: string | null;
};

async function callOrders(body: Record<string, unknown>) {
  // ไม่มีตัวตนที่ยืนยันได้ (ลูกค้าแบบ guest) → ไม่ต้องยิงฟังก์ชัน กันได้ 401 unauthorized
  if (!(await hasVerifiableIdentity())) return { orders: [], items: [], order: null };
  const id_token = readIdToken();
  const { data, error } = await supabase.functions.invoke("my-line-orders", {
    body: { ...body, ...(id_token ? { id_token } : {}) },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as any;
}

const SESSION_EXPIRED_MSG =
  "เซสชันหมดอายุ กรุณาเปิดจาก LINE หรือเข้าสู่ระบบใหม่ เพื่อดูประวัติงานของคุณ";

function isAuthError(msg: string) {
  return /unauthorized|401|jwt|expired|token/i.test(msg);
}

/** รายการคำสั่งซื้อของผู้ใช้ที่ล็อกอิน (ตรวจตัวตนฝั่งเซิร์ฟเวอร์) */
export function useMyOrders() {
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setAuthExpired(false);
    try {
      const data = await callOrders({ action: "list" });
      setOrders((data?.orders ?? []) as MyOrder[]);
      // เซสชันหมดอายุ → อย่าแสดงว่า "ไม่มีงาน" ให้บอกให้เข้าสู่ระบบใหม่
      if ((data as any)?.auth_expired) {
        setAuthExpired(true);
        setError(SESSION_EXPIRED_MSG);
      }
    } catch (e) {
      setOrders([]);
      const msg = String((e as Error)?.message || e);
      if (isAuthError(msg)) {
        setAuthExpired(true);
        setError(SESSION_EXPIRED_MSG);
      } else {
        setError("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { orders, error, authExpired, reload: load, loading: orders === null };
}

/** รายละเอียดคำสั่งซื้อเดียว */
export function useMyOrderDetail(orderId: string | undefined) {
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true); setError(null); setAuthExpired(false);
    try {
      const data = await callOrders({ action: "detail", order_id: orderId });
      setOrder(data?.order ?? null);
      setItems(data?.items ?? []);
    } catch (e) {
      setOrder(null);
      const msg = String((e as Error)?.message || e);
      if (isAuthError(msg)) {
        setAuthExpired(true);
        setError(SESSION_EXPIRED_MSG);
      } else {
        setError("ไม่พบข้อมูลงานนี้ หรือคุณไม่มีสิทธิ์เข้าถึง");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);
  return { order, items, error, authExpired, loading, reload: load };
}
