import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { liveSubscribe } from "@/lib/realtimeChannel";
import { createThrottledRefresh } from "@/lib/throttleRefresh";

/** select string ผ่านตัวช่วยนี้เพื่อไม่ให้ typecheck ช้า */
const sel = (s: string): string => s;

export interface HubCustomer {
  id: string;
  full_name: string | null;
  customer_code: string | null;
  phone: string | null;
  organization_id: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_verified_at: string | null;
  created_at: string | null;
}

export interface HubLineFriend {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  customer_id: string | null;
  last_seen_at: string | null;
}

export interface HubRequisition {
  id: string;
  user_id: string | null;
  school_name: string | null;
  project_name: string | null;
  prepared_by: string | null;
  doc_date: string | null;
  status: string | null;
  items: any[] | null;
  total: number | null;
  note: string | null;
  submitted_at: string | null;
  converted_po_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface HubOrder {
  id: string;
  po_number: string | null;
  user_id: string | null;
  customer_name: string | null;
  school_or_org: string | null;
  items: any[] | null;
  subtotal: number | null;
  net_total: number | null;
  status: string | null;
  document_no: string | null;
  note: string | null;
  created_at: string;
}

export interface HubNotification {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  ref_id: string | null;
  read: boolean | null;
  created_at: string;
}

/** สถานะที่ถือว่า "ยังรอดำเนินการ" */
export const PENDING_ORDER_STATUS = ["draft", "submitted", "pending", "review"];
export const PENDING_REQ_STATUS = ["draft", "submitted", "pending"];

/** รหัสร้าน LINE OA ของ “นัฐภรณ์ เชียงกลาง” (ไม่รวม FILM SHOP / คิวงาน) */
export const NATTA_STORE_IDS = ["default", "default:env"];


/**
 * โหลดข้อมูลทั้งหมดของศูนย์รวมงานแอดมิน (ลูกค้า / ออเดอร์ / ใบเขียนเบิก / แจ้งเตือน)
 * ใช้ตารางและ RPC เดิมทั้งหมด — ไม่มีการเปลี่ยน business logic
 */
export function useHubData() {
  const [customers, setCustomers] = useState<HubCustomer[]>([]);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [friends, setFriends] = useState<HubLineFriend[]>([]);
  const [requisitions, setRequisitions] = useState<HubRequisition[]>([]);
  const [orders, setOrders] = useState<HubOrder[]>([]);
  const [notifications, setNotifications] = useState<HubNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;
    const [p, o, l, storeFriends, reqs, pos, notis] = await Promise.all([
      db.from("profiles")
        .select(sel("id, full_name, customer_code, phone, organization_id, line_user_id, line_display_name, line_verified_at, created_at"))
        .order("created_at", { ascending: false }).limit(500),
      db.from("organizations").select(sel("id, name")).is("deleted_at", null),
      db.from("line_account_links")
        .select(sel("line_user_id, display_name, picture_url, customer_id, last_seen_at"))
        .order("last_seen_at", { ascending: false }).limit(500),
      // เพื่อน LINE OA ของ “นัฐภรณ์ เชียงกลาง” เท่านั้น (ไม่รวมร้าน FILM SHOP)
      db.from("line_store_customers")
        .select(sel("line_user_id, display_name, picture_url, last_seen_at"))
        .in("store_id", NATTA_STORE_IDS)
        .order("last_seen_at", { ascending: false }).limit(1000),
      db.from("school_requisitions")
        .select(sel("id, user_id, school_name, project_name, prepared_by, doc_date, status, items, total, note, submitted_at, converted_po_id, converted_at, created_at, updated_at"))
        .order("created_at", { ascending: false }).limit(300),
      db.from("customer_purchase_orders")
        .select(sel("id, po_number, user_id, customer_name, school_or_org, items, subtotal, net_total, status, document_no, note, created_at"))
        .order("created_at", { ascending: false }).limit(300),
      db.from("notifications")
        .select(sel("id, type, title, body, link, ref_id, read, created_at"))
        .eq("for_staff", true).order("created_at", { ascending: false }).limit(100),
    ]);
    if (!alive.current) return;
    if (p.error) toast.error("โหลดรายชื่อลูกค้าไม่สำเร็จ");
    setCustomers((p.data ?? []) as HubCustomer[]);
    setOrgs(Object.fromEntries(((o.data ?? []) as any[]).map((r) => [r.id, r.name])));
    // สถานะการผูกลูกค้ามาจาก line_account_links แต่รายชื่อเพื่อนยึดตามร้านนัฐภรณ์
    const linkMap = new Map<string, any>(((l.data ?? []) as any[]).map((r) => [r.line_user_id, r]));
    setFriends(((storeFriends.data ?? []) as any[]).map((f) => ({
      line_user_id: f.line_user_id,
      display_name: f.display_name ?? linkMap.get(f.line_user_id)?.display_name ?? null,
      picture_url: f.picture_url ?? linkMap.get(f.line_user_id)?.picture_url ?? null,
      customer_id: linkMap.get(f.line_user_id)?.customer_id ?? null,
      last_seen_at: f.last_seen_at ?? null,
    })) as HubLineFriend[]);
    setRequisitions((reqs.data ?? []) as HubRequisition[]);
    setOrders((pos.data ?? []) as HubOrder[]);
    setNotifications((notis.data ?? []) as HubNotification[]);

    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // เรียลไทม์: มีออเดอร์/ใบเบิก/แจ้งเตือน/การผูก LINE เปลี่ยน → รีเฟรชอัตโนมัติ
  useEffect(() => {
    const refresh = createThrottledRefresh(() => { void load(); }, 1500);
    const stop = liveSubscribe(
      "admin-unified-hub",
      (ch) =>
        ch
          .on("postgres_changes", { event: "*", schema: "public", table: "school_requisitions" }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "customer_purchase_orders" }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "line_account_links" }, refresh)
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh),
      refresh,
    );
    return () => { refresh.cancel(); stop(); };
  }, [load]);

  /** Optimistic UI: อัปเดตสถานะ "เชื่อมแล้ว" ทันทีหลังกดจับคู่ */
  const markLinked = useCallback((customerId: string, lineUserId: string, displayName: string | null) => {
    setCustomers((prev) => prev.map((c) => (
      c.id === customerId
        ? { ...c, line_user_id: lineUserId, line_display_name: displayName ?? c.line_display_name, line_verified_at: new Date().toISOString() }
        : c
    )));
    setFriends((prev) => prev.map((f) => (f.line_user_id === lineUserId ? { ...f, customer_id: customerId } : f)));
  }, []);

  const addCustomer = useCallback((row: HubCustomer) => {
    setCustomers((prev) => [row, ...prev.filter((c) => c.id !== row.id)]);
  }, []);

  return {
    customers, orgs, friends, requisitions, orders, notifications,
    loading, updatedAt, reload: load, markLinked, addCustomer,
  };
}

export type HubData = ReturnType<typeof useHubData>;
