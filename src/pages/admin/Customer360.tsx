import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, Link2, Loader2, RefreshCw, Search, Unlink, UserRound } from "lucide-react";
import {
  LINE_LINK_BADGE, LINE_LINK_LABEL, customerCode, lineLinkState, maskLineUserId,
} from "@/lib/customer360/identity";
import {
  mergeHistory, normalizeExcelIntake, normalizeOrder, normalizePurchaseOrder,
  normalizeRequisition, summarizeHistory, topItems, type HistoryEntry,
} from "@/lib/customer360/unifiedHistory";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import CustomerOverviewTable from "@/components/admin/CustomerOverviewTable";
import { usePaginatedList } from "@/hooks/usePaginatedList";



interface CustomerRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  customer_code: string | null;
  line_user_id: string | null;
  line_display_name: string | null;
  line_verified_at: string | null;
  organization_id: string | null;
}

interface PendingLine {
  line_user_id: string;
  display_name: string | null;
  customer_id: string | null;
  last_seen_at: string | null;
}

/** หน้าละ 50 รายการ — ไม่มีเพดานจำนวนลูกค้า กดโหลดเพิ่มได้เรื่อย ๆ */
const PAGE_SIZE = 50;
const HISTORY_PAGE = 50;

/** select string ผ่านตัวช่วยนี้เพื่อไม่ให้ typecheck ช้า */
const sel = (s: string): string => s;

/** สร้างเงื่อนไขค้นหาแบบ server-side ครอบทุกแถวในฐานข้อมูล */
export function buildCustomerSearch(term: string): string | undefined {
  const s = term.trim().replace(/[,()*]/g, " ").trim();
  if (s.length < 2) return undefined;
  return ["full_name", "phone", "email", "customer_code", "line_display_name"]
    .map((c) => `${c}.ilike.*${s}*`)
    .join(",");
}

export default function AdminCustomer360() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [itemGroups, setItemGroups] = useState<any[][]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  /** key ของ history (excel_intake:<id>) -> path ไฟล์ต้นฉบับในบัคเก็ตส่วนตัว */
  const [originals, setOriginals] = useState<Record<string, { bucket: string; path: string }>>({});
  const [busy, setBusy] = useState(false);

  // ค้นหาแบบ debounce แล้วยิงเข้าฐานข้อมูล (ไม่ใช่กรองเฉพาะแถวที่โหลดมา)
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const customers = usePaginatedList<CustomerRow>({
    table: "profiles",
    select: sel("id, full_name, phone, email, customer_code, line_user_id, line_display_name, line_verified_at, organization_id"),
    pageSize: PAGE_SIZE,
    orderBy: "created_at",
    orFilter: buildCustomerSearch(search),
  });

  const pendingLinks = usePaginatedList<PendingLine>({
    table: "line_account_links",
    select: sel("line_user_id, display_name, customer_id, last_seen_at"),
    pageSize: PAGE_SIZE,
    orderBy: "last_seen_at",
    filters: useMemo(() => ({ customer_id: { op: "is", value: null } }), []),
  });

  const rows = customers.items;
  const pending = pendingLinks.items;
  const loading = customers.loading;

  const load = useCallback(() => {
    customers.refresh();
    pendingLinks.refresh();
  }, [customers, pendingLinks]);

  useEffect(() => {
    if (customers.error) toast.error("โหลดรายชื่อลูกค้าไม่สำเร็จ");
  }, [customers.error]);

  const openCustomer = useCallback((row: CustomerRow) => {
    setSelected(row);
    setHistoryLimit(HISTORY_PAGE);
  }, []);

  // โหลดประวัติของลูกค้าที่เลือก — เพิ่มจำนวนได้ด้วยปุ่ม "ดูเพิ่ม"
  useEffect(() => {
    const row = selected;
    if (!row) { setHistory([]); setItemGroups([]); setOriginals({}); setHistoryHasMore(false); return; }
    let alive = true;
    (async () => {
      setDetailLoading(true);
      const db = supabase as any;
      const lim = historyLimit;
      const [orders, pos, reqs, xls] = await Promise.all([
        db.from("orders").select(sel("id, order_no, status, total, created_at, source")).eq("customer_id", row.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(lim),
        db.from("customer_purchase_orders").select(sel("id, po_number, status, subtotal, net_total, created_at, source, items")).eq("user_id", row.id).order("created_at", { ascending: false }).limit(lim),
        db.from("school_requisitions").select(sel("id, school_name, project_name, status, total, created_at, items")).eq("user_id", row.id).order("created_at", { ascending: false }).limit(lim),
        db.from("customer_excel_intakes").select(sel("id, filename, status, total, created_at, items, storage_bucket, storage_path")).eq("user_id", row.id).order("created_at", { ascending: false }).limit(lim),
      ]);
      if (!alive) return;
      setHistory(mergeHistory([
        (orders.data ?? []).map(normalizeOrder),
        (pos.data ?? []).map(normalizePurchaseOrder),
        (reqs.data ?? []).map(normalizeRequisition),
        (xls.data ?? []).map(normalizeExcelIntake),
      ]));
      setItemGroups([
        ...(pos.data ?? []).map((r: any) => r.items ?? []),
        ...(reqs.data ?? []).map((r: any) => r.items ?? []),
        ...(xls.data ?? []).map((r: any) => r.items ?? []),
      ]);
      setHistoryHasMore([orders, pos, reqs, xls].some((r) => (r.data ?? []).length >= lim));
      const origs: Record<string, { bucket: string; path: string }> = {};
      for (const r of (xls.data ?? []) as any[]) {
        if (r.storage_path) origs[`excel_intake:${r.id}`] = { bucket: r.storage_bucket || "customer-uploads", path: r.storage_path };
      }
      setOriginals(origs);
      setDetailLoading(false);
    })();
    return () => { alive = false; };
  }, [selected, historyLimit]);


  /** เปิดไฟล์ต้นฉบับด้วย signed URL อายุสั้น (บัคเก็ตเป็น private เสมอ) */
  async function openOriginal(key: string) {
    const ref = originals[key];
    if (!ref) return;
    const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 60);
    if (error || !data?.signedUrl) { toast.error("เปิดไฟล์ต้นฉบับไม่สำเร็จ"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const summary = useMemo(() => summarizeHistory(history), [history]);
  const frequent = useMemo(() => topItems(itemGroups), [itemGroups]);

  async function bind(lineUserId: string, customerId: string) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("admin_bind_line_customer", {
      p_line_user_id: lineUserId, p_customer_id: customerId,
    });
    setBusy(false);
    if (error) { toast.error("จับคู่ไม่สำเร็จ"); return; }
    // ระบบไม่ทับการเชื่อมเดิมเงียบ ๆ — ต้องให้แอดมินยืนยันก่อนเสมอ
    if (data && data.ok === false && data.conflict) {
      const msg = data.reason === "customer_bound_to_other_line"
        ? "ลูกค้ารายนี้ผูกกับ LINE อื่นอยู่แล้ว ยืนยันเปลี่ยนเป็นบัญชีนี้หรือไม่?"
        : "LINE นี้ผูกกับลูกค้ารายอื่นอยู่แล้ว ยืนยันย้ายมาที่ลูกค้ารายนี้หรือไม่?";
      if (!window.confirm(msg)) return;
      setBusy(true);
      const forced = await (supabase as any).rpc("admin_bind_line_customer", {
        p_line_user_id: lineUserId, p_customer_id: customerId, p_force: true,
      });
      setBusy(false);
      if (forced.error) { toast.error("จับคู่ไม่สำเร็จ"); return; }
    }
    toast.success("จับคู่ LINE กับลูกค้าเรียบร้อย");
    await load();
  }

  async function unbind(lineUserId: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("admin_unbind_line_customer", { p_line_user_id: lineUserId });
    setBusy(false);
    if (error) { toast.error("ยกเลิกการเชื่อมไม่สำเร็จ"); return; }
    toast.success("ยกเลิกการเชื่อมแล้ว (ประวัติเดิมยังอยู่ครบ)");
    await load();
  }

  return (
    <AdminLayout>
      <SeoHead title="Customer 360 — ลูกค้าคนเดียว ประวัติเดียว" description="ดูข้อมูลลูกค้า ประวัติทุกช่องทาง และจัดการการเชื่อม LINE ในหน้าเดียว" path="/admin/customer-360" />
      <div className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserRound className="w-6 h-6 text-primary" /> Customer 360</h1>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={load}><RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช</Button>
      </div>

      <div className="mb-4">
        <CustomerOverviewTable customers={rows} totalCustomers={customers.total} />
      </div>

      <Tabs defaultValue="customers">

        <TabsList className="rounded-xl">
          <TabsTrigger value="customers">ลูกค้าทั้งหมด</TabsTrigger>
          <TabsTrigger value="pending">รอจับคู่ LINE {(pendingLinks.total ?? pending.length) > 0 && `(${pendingLinks.total ?? pending.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
            <div className="ng-card p-3">
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 rounded-xl" placeholder="ค้นหาชื่อ / เบอร์ / รหัสลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {loading ? (
                <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}</div>
              ) : (
                <div className="max-h-[65vh] overflow-y-auto divide-y divide-border">
                  {rows.map((r) => {
                    const state = lineLinkState({ lineUserId: r.line_user_id, verifiedAt: r.line_verified_at, boundCustomerId: r.line_user_id ? r.id : null });
                    return (
                      <button
                        key={r.id}
                        onClick={() => openCustomer(r)}
                        data-testid="customer-row"
                        className={`w-full text-left p-3 hover:bg-accent/30 min-h-[56px] ${selected?.id === r.id ? "bg-accent/40" : ""}`}
                      >
                        <div className="font-medium truncate">{r.full_name || r.line_display_name || "ไม่ระบุชื่อ"}</div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                          <span>{customerCode(r)}</span>
                          {r.phone && <span>{r.phone}</span>}
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${LINE_LINK_BADGE[state]}`}>{LINE_LINK_LABEL[state]}</span>
                        </div>
                      </button>
                    );
                  })}
                  {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">ไม่พบลูกค้าที่ค้นหา</p>}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground" data-testid="customer-list-count">
                  แสดง {rows.length.toLocaleString("th-TH")} จาก {(customers.total ?? rows.length).toLocaleString("th-TH")} รายการ
                </span>
                {customers.hasMore && (
                  <Button size="sm" variant="outline" className="rounded-xl" data-testid="customer-load-more"
                    disabled={customers.loadingMore} onClick={customers.loadMore}>
                    {customers.loadingMore ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} โหลดเพิ่ม
                  </Button>
                )}
              </div>
            </div>


            <div className="ng-card p-4 min-h-[320px]">
              {!selected && <p className="text-sm text-muted-foreground">เลือกลูกค้าทางซ้ายเพื่อดูประวัติทั้งหมด</p>}
              {selected && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">{selected.full_name || selected.line_display_name || "ไม่ระบุชื่อ"}</h2>
                      <p className="text-xs text-muted-foreground">
                        {customerCode(selected)} · {selected.phone || "ไม่มีเบอร์"} · LINE {maskLineUserId(selected.line_user_id)}
                      </p>
                    </div>
                    {selected.line_user_id && (
                      <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => unbind(selected.line_user_id!)}>
                        <Unlink className="w-4 h-4 mr-1" /> ยกเลิกการเชื่อม LINE
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Stat label="รายการทั้งหมด" value={String(summary.count)} />
                    <Stat label="ยอดรวมสะสม" value={fmtTHB(summary.totalAmount)} />
                    <Stat label="ใบเขียนเบิก" value={String(summary.byType.requisition)} />
                    <Stat label="ไฟล์ Excel" value={String(summary.byType.excel_intake)} />
                  </div>

                  {frequent.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">สินค้าที่สั่งบ่อย</h3>
                      <div className="flex flex-wrap gap-2">
                        {frequent.map((f) => (
                          <span key={f.name} className="text-xs px-2 py-1 rounded-full border border-border bg-muted">
                            {f.name} · {f.qty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium mb-2">ประวัติรวมทุกช่องทาง</h3>
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…</div>
                    ) : history.length === 0 ? (
                      <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
                    ) : (
                      <div className="divide-y divide-border max-h-[45vh] overflow-y-auto rounded-xl border border-border">
                        {history.map((e) => (
                          <div key={e.key} className="p-2.5 flex items-center gap-3 text-sm">
                            <span className="px-2 py-0.5 rounded-full border border-border bg-muted text-[11px] shrink-0">{e.typeLabel}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{e.title}</div>
                              <div className="text-xs text-muted-foreground">{fmtDateTime(e.createdAt)} · {e.statusLabel}</div>
                            </div>
                            {!!e.amount && <span className="shrink-0">{fmtTHB(e.amount)}</span>}
                            {originals[e.key] && (
                              <Button size="sm" variant="ghost" className="rounded-xl shrink-0" data-testid="open-original"
                                onClick={() => void openOriginal(e.key)}>
                                <Download className="w-4 h-4 mr-1" /> ต้นฉบับ
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground" data-testid="history-count">
                        แสดง {history.length.toLocaleString("th-TH")} รายการ
                      </span>
                      {historyHasMore && (
                        <Button size="sm" variant="outline" className="rounded-xl" data-testid="history-load-more"
                          disabled={detailLoading} onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}>
                          ดูเพิ่ม
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <div className="ng-card p-4">
            <p className="text-sm text-muted-foreground mb-3">
              บัญชี LINE ที่ทักเข้ามาแต่ยังไม่รู้ว่าเป็นลูกค้าคนไหน — เลือกลูกค้าเพื่อจับคู่ (ระบบไม่จับคู่อัตโนมัติจากชื่อ)
            </p>
            {pending.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีรายการรอจับคู่</p>}
            <div className="divide-y divide-border">
              {pending.map((p) => (
                <div key={p.line_user_id} className="py-3 flex flex-wrap items-center gap-3" data-testid="pending-line-row">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.display_name || "ผู้ใช้ LINE"}</div>
                    <div className="text-xs text-muted-foreground">{maskLineUserId(p.line_user_id)} · ล่าสุด {fmtDateTime(p.last_seen_at)}</div>
                  </div>
                  <select
                    className="h-11 rounded-xl border border-border bg-background px-3 text-sm min-w-[220px]"
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) => { if (e.target.value) void bind(p.line_user_id, e.target.value); }}
                  >
                    <option value="">เลือกลูกค้าเพื่อจับคู่…</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {(r.full_name || "ไม่ระบุชื่อ")} · {customerCode(r)}{r.phone ? ` · ${r.phone}` : ""}
                      </option>
                    ))}
                  </select>
                  <Link2 className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground" data-testid="pending-count">
                แสดง {pending.length.toLocaleString("th-TH")} จาก {(pendingLinks.total ?? pending.length).toLocaleString("th-TH")} รายการ
              </span>
              {pendingLinks.hasMore && (
                <Button size="sm" variant="outline" className="rounded-xl" data-testid="pending-load-more"
                  disabled={pendingLinks.loadingMore} onClick={pendingLinks.loadMore}>
                  โหลดเพิ่ม
                </Button>
              )}
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </AdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
