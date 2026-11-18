import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Copy, RefreshCw, Loader2, Webhook, MessageCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/useRealtimeTable";
import { toast } from "sonner";

type Row = {
  id: string;
  received_at: string;
  signature_ok: boolean;
  event_type: string | null;
  source_user_id: string | null;
  message_text: string | null;
  reply_token: string | null;
  raw: any;
  handler_result: string | null;
  handler_error: string | null;
  channel_id: string | null;
  channel_label: string | null;
  destination: string | null;
};

const SHOP_LABELS: Record<string, string> = {
  default: "ร้านที่ 1 (หลัก)",
  shop2: "ร้านที่ 2",
  dev: "dev (ไม่ตรวจลายเซ็น)",
};

function shopName(id?: string | null) {
  if (!id) return "ไม่ทราบร้าน";
  return SHOP_LABELS[id] || id;
}

export default function AdminLineWebhookEvents() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [shop, setShop] = useState<"all" | string>("all");
  /** line_event_id / line_message_id -> channel_id stored on the intake row */
  const [intakeChannels, setIntakeChannels] = useState<Record<string, string | null>>({});
  /** line_event_id / line_message_id -> the order the intake produced (if any) */
  const [intakeOrders, setIntakeOrders] = useState<Record<string, { id: string; order_no: string | null; status: string | null; intake_status: string | null }>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("line_webhook_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Row[]);

    const { data: reqs } = await supabase
      .from("film_job_requests")
      .select("line_event_id, line_message_id, parsed, linked_order_id, intake_status")
      .order("received_at", { ascending: false })
      .limit(300);
    const map: Record<string, string | null> = {};
    const orderIds = new Set<string>();
    for (const r of (reqs ?? []) as any[]) {
      const ch = (r.parsed as any)?.channel_id ?? null;
      if (r.line_event_id) map[r.line_event_id] = ch;
      if (r.line_message_id) map[r.line_message_id] = ch;
      if (r.linked_order_id) orderIds.add(r.linked_order_id);
    }
    setIntakeChannels(map);

    let orders: Record<string, { order_no: string | null; status: string | null }> = {};
    if (orderIds.size) {
      const { data: ords } = await supabase
        .from("film_orders")
        .select("id, order_no, status")
        .in("id", Array.from(orderIds));
      for (const o of (ords ?? []) as any[]) orders[o.id] = { order_no: o.order_no, status: o.status };
    }
    const omap: Record<string, { id: string; order_no: string | null; status: string | null; intake_status: string | null }> = {};
    for (const r of (reqs ?? []) as any[]) {
      if (!r.linked_order_id) continue;
      const info = {
        id: r.linked_order_id as string,
        order_no: orders[r.linked_order_id]?.order_no ?? null,
        status: orders[r.linked_order_id]?.status ?? null,
        intake_status: r.intake_status ?? null,
      };
      if (r.line_event_id) omap[r.line_event_id] = info;
      if (r.line_message_id) omap[r.line_message_id] = info;
    }
    setIntakeOrders(omap);
  }
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["line_webhook_events"], () => load());

  /** Compare the OA that signed the webhook with the channel_id saved by the intake. */
  function matchInfo(r: Row): { state: "ok" | "mismatch" | "none"; intake: string | null } {
    const key = r.raw?.webhookEventId || r.raw?.message?.id || null;
    if (!key || !(key in intakeChannels)) return { state: "none", intake: null };
    const intake = intakeChannels[key];
    return { state: (intake ?? null) === (r.channel_id ?? null) ? "ok" : "mismatch", intake: intake ?? null };
  }

  /** The film order created from this webhook event, if the intake linked one. */
  function orderInfo(r: Row) {
    const key = r.raw?.webhookEventId || r.raw?.message?.id || null;
    if (!key) return null;
    return intakeOrders[key] ?? null;
  }

  const shops = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => r.channel_id && s.add(r.channel_id));
    return Array.from(s);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = rows;
    if (shop !== "all") base = base.filter(r => (r.channel_id ?? "") === shop);
    if (!q) return base;
    return base.filter(r => {
      const blob = [r.event_type, r.source_user_id, r.message_text, r.handler_result, r.handler_error, r.channel_id, r.channel_label].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, shop]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก ${label}`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  return (
    <AdminLayout>
      <SeoHead title="LINE Webhook Events — แอดมิน" description="ดู event ที่ LINE webhook ได้รับล่าสุด เพื่อตรวจสาเหตุการส่งข้อความและรับ userId ของแอดมิน" path="/admin/line-webhook-events" />
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="w-6 h-6 text-primary" /> LINE Webhook Events</h1>
          <p className="text-sm text-muted-foreground">เหตุการณ์ล่าสุดที่ LINE ส่งมาที่ webhook — ใช้ตรวจสาเหตุการส่งข้อความ และคัดลอก userId ของแอดมิน</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/line-settings">ตั้งค่า LINE</Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/admin/line-notifications"><MessageCircle className="w-4 h-4 mr-1" /> สถานะการส่ง LINE</Link>
          </Button>
          <Button className="rounded-xl bg-primary text-primary-foreground" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} รีเฟรช
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="ค้นหา event / userId / ข้อความ / error…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md rounded-xl" />
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={shop === "all" ? "default" : "outline"} className="rounded-xl" onClick={() => setShop("all")}>ทุกร้าน</Button>
          {shops.map(s => (
            <Button key={s} size="sm" variant={shop === s ? "default" : "outline"} className="rounded-xl" onClick={() => setShop(s)}>{shopName(s)}</Button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr className="text-left">
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">เวลา</th>
                <th className="px-3 py-2">type</th>
                <th className="px-3 py-2">ร้าน (OA)</th>
                <th className="px-3 py-2">HMAC</th>
                <th className="px-3 py-2">userId</th>
                <th className="px-3 py-2">จับคู่ intake</th>
                <th className="px-3 py-2">ออเดอร์ที่สร้าง</th>
                <th className="px-3 py-2">handler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const open = !!expanded[r.id];
                const hasErr = !!r.handler_error;
                const m = matchInfo(r);
                const ord = orderInfo(r);
                return (
                  <>
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <button onClick={() => setExpanded(e => ({ ...e, [r.id]: !open }))}>
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDateTime(r.received_at)}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{r.event_type || "—"}</Badge></td>
                      <td className="px-3 py-2 text-xs">
                        <Badge variant="secondary" className={r.channel_id ? "" : "bg-muted text-muted-foreground"}>
                          {r.channel_label || shopName(r.channel_id)}
                        </Badge>
                        {r.channel_id && <div className="text-[10px] text-muted-foreground mt-0.5">id: {r.channel_id}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={r.signature_ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"} variant="secondary">
                          {r.signature_ok ? "ok" : "fail"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.source_user_id ? (
                          <span className="inline-flex items-center gap-1">
                            <code className="break-all">{r.source_user_id}</code>
                            <button className="text-primary hover:underline" onClick={() => copy(r.source_user_id!, "userId")}>
                              <Copy className="w-3 h-3" />
                            </button>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {m.state === "none" ? <span className="text-muted-foreground">—</span>
                          : m.state === "ok"
                            ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">ตรงกัน</Badge>
                            : <Badge variant="secondary" className="bg-rose-100 text-rose-700">ไม่ตรง ({m.intake ?? "ว่าง"})</Badge>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {ord ? (
                          <Link to="/admin/work-docs" className="inline-flex flex-col gap-0.5 hover:underline">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{ord.order_no || "สร้างแล้ว"}</Badge>
                            {ord.status && <span className="text-[10px] text-muted-foreground">สถานะ: {ord.status}</span>}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">ยังไม่สร้าง</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-xs max-w-md ${hasErr ? "text-rose-600" : "text-muted-foreground"}`}>
                        <div className="truncate">{r.handler_error || r.handler_result || "—"}</div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-muted/20 border-t border-border">
                        <td></td>
                        <td colSpan={8} className="px-3 py-3">
                          <div className="grid sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="mb-2">
                                <span className="font-semibold">ที่มา: </span>
                                {r.channel_label || shopName(r.channel_id)} ({r.channel_id || "—"})
                                {r.destination && <span className="text-muted-foreground"> · destination: <code className="break-all">{r.destination}</code></span>}
                                {m.state !== "none" && (
                                  <span> · intake channel_id: <code>{m.intake ?? "ว่าง"}</code> {m.state === "ok" ? "✅" : "⚠️ ไม่ตรงกับ OA ที่ส่ง"}</span>
                                )}
                              </div>
                              <div className="mb-2">
                                <span className="font-semibold">ออเดอร์: </span>
                                {ord
                                  ? <>สร้างแล้ว <code>{ord.order_no || ord.id}</code> · สถานะออเดอร์: {ord.status || "—"} · intake: {ord.intake_status || "—"}</>
                                  : "ยังไม่มีออเดอร์จาก event นี้"}
                              </div>
                              <div className="font-semibold mb-1">message_text</div>
                              <pre className="whitespace-pre-wrap bg-background p-2 rounded-lg border border-border max-h-64 overflow-auto">{r.message_text || "—"}</pre>
                              {r.handler_error && (
                                <div className="mt-2 text-rose-600">
                                  <div className="font-semibold">handler_error</div>
                                  <pre className="whitespace-pre-wrap bg-background p-2 rounded-lg border border-rose-300 max-h-32 overflow-auto">{r.handler_error}</pre>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-semibold mb-1">raw event</div>
                              <pre className="whitespace-pre-wrap bg-background p-2 rounded-lg border border-border max-h-64 overflow-auto">{JSON.stringify(r.raw, null, 2)}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">
                  ยังไม่มี event — ให้แอดมินทักหา OA หรือเปิด webhook URL ใน LINE Console แล้วกด <i>Verify</i>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}