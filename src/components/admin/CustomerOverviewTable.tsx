import { useEffect, useMemo, useState } from "react";
import { FileText, Link2Off, ShoppingBag, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/format";
import { LINE_LINK_BADGE, LINE_LINK_LABEL, customerCode, lineLinkState } from "@/lib/customer360/identity";

export interface OverviewCustomer {
  id: string;
  full_name: string | null;
  phone: string | null;
  customer_code: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_verified_at: string | null;
}

interface LatestDoc {
  label: string;
  at: string;
}

/**
 * ตารางสรุปลูกค้าแบบกระชับตามแบบที่แนบ — การ์ดสรุป 4 ช่อง + ตารางขอบเหลี่ยม (ไม่มนขอบ)
 * แสดงผลอย่างเดียว ไม่แตะ business logic ของออเดอร์/ใบเขียนเบิก
 */
export default function CustomerOverviewTable({
  customers,
  totalCustomers,
}: {
  customers: OverviewCustomer[];
  /** จำนวนลูกค้าทั้งหมดในฐานข้อมูล (ไม่ใช่แค่หน้าที่โหลดมา) */
  totalCustomers?: number | null;
}) {
  const [q, setQ] = useState("");
  const [reqCount, setReqCount] = useState(0);
  const [poCount, setPoCount] = useState(0);
  const [latest, setLatest] = useState<Record<string, LatestDoc>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const [reqs, pos, reqTotal, poTotal] = await Promise.all([
        supabase
          .from("school_requisitions")
          .select("user_id, school_name, project_name, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("customer_purchase_orders")
          .select("user_id, po_number, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("school_requisitions").select("id", { count: "exact", head: true }),
        supabase.from("customer_purchase_orders").select("id", { count: "exact", head: true }),
      ]);
      if (!alive) return;
      const map: Record<string, LatestDoc> = {};
      for (const r of (reqs.data ?? []) as any[]) {
        if (!r.user_id || map[r.user_id]) continue;
        map[r.user_id] = { label: `ใบเขียนเบิก ${r.project_name || r.school_name || ""}`.trim(), at: r.created_at };
      }
      for (const p of (pos.data ?? []) as any[]) {
        if (!p.user_id) continue;
        const cur = map[p.user_id];
        if (!cur || new Date(p.created_at) > new Date(cur.at)) {
          map[p.user_id] = { label: `ใบสั่งซื้อ ${p.po_number || ""}`.trim(), at: p.created_at };
        }
      }
      setLatest(map);
      setReqCount(reqTotal.count ?? reqs.data?.length ?? 0);
      setPoCount(poTotal.count ?? pos.data?.length ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const unlinked = customers.filter((c) => !c.line_user_id).length;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) =>
      [c.full_name, c.line_display_name, c.phone, c.customer_code].some((v) => (v || "").toLowerCase().includes(s)),
    );
  }, [customers, q]);

  const metrics = [
    { key: "customers", label: "ลูกค้าทั้งหมด", value: totalCustomers ?? customers.length, icon: Users },
    { key: "requisitions", label: "ใบเขียนเบิก", value: reqCount, icon: FileText },
    { key: "orders", label: "ใบสั่งซื้อ", value: poCount, icon: ShoppingBag },
    { key: "pending-link", label: "รอเชื่อมบัญชี LINE", value: unlinked, icon: Link2Off },
  ];


  return (
    <section className="space-y-3" data-testid="customer-overview">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="customer-overview-metrics">
        {metrics.map(({ key, label, value, icon: Icon }) => (
          <div
            key={key}
            data-testid={`customer-metric-${key}`}
            className="flex items-center gap-3 border border-border bg-card p-3"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center bg-primary/10">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold tabular-nums leading-tight">{value.toLocaleString("th-TH")}</span>
              <span className="block truncate text-xs text-muted-foreground">{label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="border border-border bg-card">
        <div className="border-b border-border p-3">
          <Input
            className="rounded-none"
            placeholder="ค้นหาชื่อ / เบอร์ / รหัสลูกค้า"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="customer-overview-search"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="customer-overview-table">
            <thead>
              <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="border-b border-border px-3 py-2 font-semibold">ลูกค้า</th>
                <th className="border-b border-border px-3 py-2 font-semibold">เบอร์โทร</th>
                <th className="border-b border-border px-3 py-2 font-semibold">สถานะ LINE</th>
                <th className="border-b border-border px-3 py-2 font-semibold">รายการล่าสุด</th>
                <th className="border-b border-border px-3 py-2 font-semibold">อัปเดต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const state = lineLinkState({
                  lineUserId: c.line_user_id,
                  verifiedAt: c.line_verified_at,
                  boundCustomerId: c.line_user_id ? c.id : null,
                });
                const doc = latest[c.id];
                return (
                  <tr key={c.id} className="hover:bg-accent/30" data-testid="customer-overview-row">
                    <td className="border-b border-border px-3 py-2">
                      <div className="font-medium">{c.full_name || c.line_display_name || "ไม่ระบุชื่อ"}</div>
                      <div className="text-xs text-muted-foreground">{customerCode(c)}</div>
                    </td>
                    <td className="border-b border-border px-3 py-2 tabular-nums">{c.phone || "—"}</td>
                    <td className="border-b border-border px-3 py-2">
                      <span className={`inline-block border px-2 py-0.5 text-[11px] ${LINE_LINK_BADGE[state]}`}>
                        {LINE_LINK_LABEL[state]}
                      </span>
                    </td>
                    <td className="border-b border-border px-3 py-2">{doc?.label || "—"}</td>
                    <td className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                      {doc ? fmtDateTime(doc.at) : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    ไม่พบลูกค้าที่ค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
