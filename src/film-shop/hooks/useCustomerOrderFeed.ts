import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';
import { isStatusChanged, markManySeen } from '@/lib/orderStatusSeen';

export type OrderFeedSource = 'document' | 'shop' | 'line' | 'order' | 'cart';

export interface CustomerOrderFeedItem {
  key: string;
  id: string;
  source: OrderFeedSource;
  sourceLabel: string;
  refNo: string;
  customerName: string;
  title: string;
  total: number;
  status: string;
  createdAt: Date;
  /** สถานะเปลี่ยนไปจากครั้งก่อนที่ผู้ใช้เห็น */
  statusChanged?: boolean;
}

const SEEN_KEY = 'film-shop:customer-order-feed:lastSeen';

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

function readLastSeen(): number {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * ออเดอร์ลูกค้าจากทุกช่องทางในที่เดียว:
 *  - เอกสาร/ใบแจ้งหนี้ของ Film Shop (film_invoices)
 *  - ออเดอร์จากหน้าคำสั่งซื้อหลักของร้านลูกค้า (orders)
 *  - คำขอจาก LINE OA (film_job_requests)
 *  - ออเดอร์ในโมเดลใหม่ของ Film Shop (film_orders)
 * ทุกแหล่งดึงแบบเดียวกัน ถ้าแหล่งใดอ่านไม่ได้ก็ข้ามไปโดยไม่ทำให้ทั้งฟีดพัง
 */
export function useCustomerOrderFeed(limit = 30) {
  const [items, setItems] = useState<CustomerOrderFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSeen, setLastSeen] = useState<number>(() => readLastSeen());

  const load = useCallback(async () => {
    const db = supabase as any;
    const [inv, shopOrders, lineReqs, filmOrders, cartOrders] = await Promise.all([
      db.from('film_invoices')
        .select('id,invoice_number,type,status,customer_name,notes,total,created_at,is_draft')
        .order('created_at', { ascending: false }).limit(limit),
      db.from('orders')
        .select('id,order_no,status,total,guest_name,project_name,school_name,created_at,deleted_at')
        .order('created_at', { ascending: false }).limit(limit),
      db.from('film_job_requests')
        .select('id,customer_name,title,intake_status,created_at')
        .order('created_at', { ascending: false }).limit(limit),
      db.from('film_orders')
        .select('id,order_no,customer_name,title,total,status,created_at,is_draft')
        .order('created_at', { ascending: false }).limit(limit),
      db.from('guest_orders')
        .select('id,order_no,kind,customer_name,line_display_name,note,total,status,source,created_at')
        .order('created_at', { ascending: false }).limit(limit),
    ]);

    const out: CustomerOrderFeedItem[] = [];

    for (const r of (inv.data ?? []) as any[]) {
      if (r.is_draft) continue;
      out.push({
        key: `document:${r.id}`,
        id: r.id,
        source: 'document',
        sourceLabel: 'เอกสาร/ใบแจ้งหนี้',
        refNo: r.invoice_number ?? '—',
        customerName: r.customer_name ?? 'ไม่ระบุลูกค้า',
        title: r.notes ?? r.type ?? '',
        total: num(r.total),
        status: r.status ?? '',
        createdAt: new Date(r.created_at),
      });
    }

    for (const r of (shopOrders.data ?? []) as any[]) {
      if (r.deleted_at) continue;
      out.push({
        key: `shop:${r.id}`,
        id: r.id,
        source: 'shop',
        sourceLabel: 'คำสั่งซื้อหลัก',
        refNo: r.order_no ?? '—',
        customerName: r.guest_name || r.school_name || 'ลูกค้าออนไลน์',
        title: r.project_name ?? '',
        total: num(r.total),
        status: r.status ?? '',
        createdAt: new Date(r.created_at),
      });
    }

    for (const r of (lineReqs.data ?? []) as any[]) {
      out.push({
        key: `line:${r.id}`,
        id: r.id,
        source: 'line',
        sourceLabel: 'LINE OA',
        refNo: 'LINE',
        customerName: r.customer_name ?? 'ลูกค้า LINE',
        title: r.title ?? '',
        total: 0,
        status: r.intake_status ?? '',
        createdAt: new Date(r.created_at),
      });
    }

    for (const r of (filmOrders.data ?? []) as any[]) {
      if (r.is_draft) continue;
      out.push({
        key: `order:${r.id}`,
        id: r.id,
        source: 'order',
        sourceLabel: 'ออเดอร์ร้าน',
        refNo: r.order_no ?? '—',
        customerName: r.customer_name ?? 'ไม่ระบุลูกค้า',
        title: r.title ?? '',
        total: num(r.total),
        status: r.status ?? '',
        createdAt: new Date(r.created_at),
      });
    }

    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    for (const r of (cartOrders.data ?? []) as any[]) {
      out.push({
        key: `cart:${r.id}`,
        id: r.id,
        source: 'cart',
        sourceLabel: r.kind === 'quote' ? 'ขอใบเสนอราคา (ตะกร้า)' : 'ออเดอร์จากตะกร้า',
        refNo: r.order_no ?? '—',
        customerName: r.customer_name || r.line_display_name || 'ลูกค้าออนไลน์',
        title: r.note ?? '',
        total: num(r.total),
        status: r.status ?? '',
        createdAt: new Date(r.created_at),
      });
    }

    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const sliced = out.slice(0, limit).map((it) => ({
      ...it,
      statusChanged: isStatusChanged(it.key, it.status),
    }));
    setItems(sliced);
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);
  useRealtimeWithFallback(['film_invoices', 'orders', 'film_job_requests', 'film_orders', 'guest_orders'], load);

  const unseen = useMemo(
    () => items.filter((i) => i.createdAt.getTime() > lastSeen),
    [items, lastSeen],
  );

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    try { localStorage.setItem(SEEN_KEY, String(now)); } catch { /* ignore */ }
    setLastSeen(now);
    setItems((prev) => {
      markManySeen(prev.map((i) => ({ key: i.key, status: i.status })));
      return prev.map((i) => ({ ...i, statusChanged: false }));
    });
  }, []);

  // จดจำสถานะครั้งแรกที่เห็น เพื่อให้รอบถัดไปตรวจจับการเปลี่ยนแปลงได้
  useEffect(() => {
    if (loading) return;
    const fresh = items.filter((i) => !i.statusChanged);
    if (fresh.length) markManySeen(fresh.map((i) => ({ key: i.key, status: i.status })));
  }, [items, loading]);

  const statusChangedCount = useMemo(
    () => items.filter((i) => i.statusChanged).length,
    [items],
  );

  const todayItems = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return items.filter((i) => i.createdAt >= start);
  }, [items]);

  return { items, todayItems, unseen, unseenCount: unseen.length, statusChangedCount, loading, reload: load, markAllSeen, lastSeen };
}
