import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Eye, Share2 } from "lucide-react";
import { toast } from "sonner";
import AccountPage, { EmptyState, ErrorState, ListSkeleton } from "@/components/account/AccountPage";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import { useMyOrders, type MyOrder } from "@/hooks/useMyOrders";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { ACCOUNT_ROUTES } from "@/lib/customerAccountRoutes";

const TABS = [
  { key: "issued", label: "ออกเอกสารแล้ว" },
  { key: "received", label: "ได้รับเอกสารแล้ว" },
];

/**
 * เอกสารของลูกค้า — ดู/ดาวน์โหลด/แชร์ได้เฉพาะเอกสารที่ร้านออกให้บัญชีตนเอง
 * ลูกค้าไม่มีสิทธิ์สร้าง แก้ไข หรือเลือกเทมเพลตเอกสาร
 */
export default function MyDocuments() {
  const { orders, error, reload, loading } = useMyOrders();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "received" ? "received" : "issued";
  const [q, setQ] = useState("");
  const userId = useAuthUserId();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (orders ?? [])
      .filter((o) => !!o.receipt_issued_at)
      .filter((o) => (tab === "received" ? String(o.status) === "completed" : String(o.status) !== "completed"))
      .filter((o) => !term || `${o.order_no ?? ""} ${o.receipt_no ?? ""}`.toLowerCase().includes(term));
  }, [orders, tab, q]);

  /** บันทึกว่าลูกค้าเปิดดูเอกสารครั้งแรกเมื่อใด (ไม่บล็อกการแสดงผล) */
  const markViewed = useCallback(async (orderId: string) => {
    if (!userId) return;
    await (supabase as any)
      .from("document_receipts")
      .upsert({ user_id: userId, order_id: orderId }, { onConflict: "user_id,order_id", ignoreDuplicates: true });
  }, [userId]);

  const share = async (o: MyOrder) => {
    const url = `${window.location.origin}/my-orders/${o.id}/receipt`;
    const text = `เอกสารเลขที่ ${o.receipt_no || o.order_no || ""}`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); toast.success("คัดลอกลิงก์เอกสารแล้ว"); }
    } catch { /* ผู้ใช้ยกเลิกการแชร์ */ }
  };

  return (
    <AccountPage title="เอกสารของฉัน" description="ใบเสนอราคา ใบส่งของ และใบเสร็จที่ร้านออกให้คุณ" path={ACCOUNT_ROUTES.documents}>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            data-testid={`documents-tab-${t.key}`}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={`flex-1 min-h-11 rounded-full px-3 text-[13px] font-medium ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-primary/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาเลขเอกสารหรือเลขงาน"
        aria-label="ค้นหาเอกสาร"
        className="min-h-11 rounded-xl bg-card"
      />

      {loading ? <ListSkeleton /> : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : rows.length === 0 ? (
        <EmptyState title="ยังไม่มีเอกสารในหมวดนี้" hint="เมื่อร้านออกเอกสารให้ คุณจะเห็นรายการที่นี่" />
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <article key={o.id} className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-primary/10" data-testid={`document-${o.id}`}>
              <div className="text-[15px] font-semibold">{o.receipt_no || `งาน #${o.order_no}`}</div>
              <div className="text-[12px] text-muted-foreground">ออกเอกสารเมื่อ {fmtDateTime(o.receipt_issued_at)}</div>
              <div className="mt-1 text-[14px] font-semibold tabular-nums">{fmtTHB(o.total ?? 0)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/my-orders/${o.id}/receipt`}
                  onClick={() => void markViewed(o.id)}
                  className="inline-flex items-center gap-1 min-h-11 rounded-xl bg-primary px-3 text-[13px] font-medium text-primary-foreground"
                >
                  <Eye className="w-4 h-4" aria-hidden /> ดูเอกสาร
                </Link>
                <Link
                  to={`/my-orders/${o.id}/receipt?print=1`}
                  onClick={() => void markViewed(o.id)}
                  className="inline-flex items-center gap-1 min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium"
                >
                  <Download className="w-4 h-4" aria-hidden /> ดาวน์โหลด PDF
                </Link>
                <button
                  type="button"
                  onClick={() => void share(o)}
                  className="inline-flex items-center gap-1 min-h-11 rounded-xl border border-border px-3 text-[13px] font-medium"
                >
                  <Share2 className="w-4 h-4" aria-hidden /> แชร์
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AccountPage>
  );
}
