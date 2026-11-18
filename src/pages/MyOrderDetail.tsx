import CustomerLayout from "@/components/layout/CustomerLayout";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, fmtTHB, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Download, Receipt, FileText, Send, Printer, Clipboard, ClipboardList, FilePlus2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useGuest } from "@/contexts/GuestContext";
import SeoHead from "@/components/SeoHead";
import { downloadXlsx } from "@/lib/xlsx";
import { downloadCsv } from "@/lib/csv";
import { logOrderAction } from "@/lib/orderActivity";
import { openLine } from "@/lib/line";
import { Badge } from "@/components/ui/badge";
import { downloadPdf } from "@/lib/pdf";
import { readIdToken } from "@/lib/lineSession";
import { readOrderLinkToken } from "@/lib/orderLinkTokens";
import { useLineCustomer } from "@/contexts/LineCustomerContext";
import { CustomerBreadcrumbs, customerNavyButtonClass } from "@/components/layout/CustomerBreadcrumbs";
import { getHostMode } from "@/lib/hostMode";
import { useAuth } from "@/contexts/AuthContext";
import OrderActivityTimeline from "@/components/admin/OrderActivityTimeline";

/** Copy `text` to clipboard, falling back to a hidden textarea + execCommand
 *  when the async Clipboard API is unavailable (Safari iOS in-app browsers,
 *  denied permission, insecure contexts). Returns true on success. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

async function resolveReceiptStoreSlug(order: any): Promise<string | null> {
  const directSlug = String(order?.drive_store_slug ?? order?.store_slug ?? "").trim();
  if (directSlug === "printing" || directSlug === "colorlab") return directSlug;
  const shopId = String(order?.shop_id ?? "").trim();
  if (!shopId) return null;
  const { data } = await supabase
    .from("rds_stores" as any)
    .select("slug")
    .eq("id", shopId)
    .maybeSingle();
  const slug = String((data as any)?.slug ?? "").trim();
  return slug === "printing" || slug === "colorlab" ? slug : null;
}

export default function MyOrderDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { session } = useGuest();
  const { profile: lineProfile } = useLineCustomer();
  const { isOwner, isAdmin } = useAuth();
  // Document-sending / document-creation actions are shop-side work: only the
  // admin workspace may see them (customers just download / copy).
  const isAdminSurface = getHostMode() === "admin" && (isOwner || isAdmin);
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  // Link-token surface: from URL (?t=), or stored right after order submit.
  const linkToken = (() => {
    const q = search.get("t");
    if (q) return q;
    return id ? readOrderLinkToken(id) : "";
  })();

  async function load() {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const id_token = readIdToken();
      if (id_token || lineProfile) {
        const { data, error } = await supabase.functions.invoke("my-line-orders", {
          body: { action: "detail", order_id: id, ...(id_token ? { id_token } : {}) },
        });
        if (error) throw error;
        const payload = (data as any) ?? {};
        if (payload.error) throw new Error(payload.error === "forbidden" ? "คุณไม่มีสิทธิ์ดู" : payload.error);
        if (!payload.order) throw new Error("ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์ดู");
        setOrder(payload.order);
        setItems(payload.items ?? []);
        setOrg(payload.organization ?? null);
        return;
      }
      if (!session?.guest_id || !session?.phone) { nav("/shop"); return; }
      const { data, error } = await supabase.rpc("get_guest_order_detail", {
        p_guest_id: session.guest_id,
        p_phone: session.phone,
        p_order_id: id,
      });
      if (error) throw error;
      const payload = (data as any) ?? {};
      if (!payload.order) throw new Error("ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์ดู");
      setOrder(payload.order);
      setItems(payload.items ?? []);
      setOrg(payload.organization ?? null);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, session?.guest_id, lineProfile?.line_user_id]);

  // Timeline: fetch via token-guarded RPC; poll for updates (RLS blocks
  // direct SELECT / realtime for guests by design — token proves ownership).
  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    const token = linkToken || order?.line_link_token || null;
    async function fetchEvents() {
      const { data } = await supabase.rpc("get_order_status_events", {
        p_order_id: order.id,
        p_link_token: token,
      });
      if (!cancelled) setEvents((data as any[]) ?? []);
    }
    fetchEvents();
    const iv = setInterval(fetchEvents, 10_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [order?.id, linkToken, order?.line_link_token]);

  const [shopLine, setShopLine] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_public_settings");
      const row: any = Array.isArray(data) ? data[0] : data;
      setShopLine(row?.line_url || null);
    })();
  }, []);

  const [notif, setNotif] = useState<any>(null);
  useEffect(() => {
    if (!order?.id) return;
    (async () => {
      const { data } = await supabase
        .from("line_notifications")
        .select("sent_status, sent_at, created_at, last_attempt_at, error_message, retry_count")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setNotif(data);
    })();
  }, [order?.id]);

  function notifBadge() {
    if (!notif) return null;
    const s = notif.sent_status;
    const ts = notif.sent_at || notif.last_attempt_at || notif.created_at;
    const badge = s === "sent"
      ? <Badge className="bg-success text-white text-[10px]">แจ้งเตือน LINE: ส่งแล้ว</Badge>
      : s === "failed"
      ? <Badge variant="outline" className="border-destructive text-destructive text-[10px]">แจ้งเตือน LINE: ล้มเหลว</Badge>
      : s === "skipped"
      ? <Badge variant="outline" className="text-[10px]">แจ้งเตือน LINE: ข้าม</Badge>
      : <Badge variant="outline" className="border-warning text-warning text-[10px]">แจ้งเตือน LINE: รอส่ง</Badge>;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {badge}
          {ts && <span className="text-[10px] text-muted-foreground">{fmtDateTime(ts)}</span>}
          {Number(notif.retry_count) > 0 && (
            <span className="text-[10px] text-muted-foreground">· retry {notif.retry_count} ครั้ง</span>
          )}
        </div>
        {s === "failed" && notif.error_message && (
          <div className="text-[11px] text-destructive whitespace-pre-wrap">
            เหตุผล: {notif.error_message}
          </div>
        )}
      </div>
    );
  }

  function buildExportRows() {
    return items.map((i: any, idx: number) => ({
      "ลำดับ": idx + 1,
      "รหัสสินค้า": i.product_code || "",
      "รายการ": i.product_name,
      "จำนวน": Number(i.qty),
      "หน่วย": i.unit || "",
      "ราคา/หน่วย": Number(i.price || 0),
      "รวม": Number(i.total || 0),
    }));
  }

  function exportCsv() {
    if (!order) return;
    const rows = buildExportRows();
    const filename = `order-${order.order_no}`;
    downloadXlsx(filename, { [order.order_no]: rows }, undefined, {
      storeName: "ร้านนัฐภรณ์ เชียงกลาง",
      subtitle: `คำสั่งซื้อ ${order.order_no} — ${fmtDateTime(order.created_at)}`,
    });
    void logOrderAction(order.id, "order_export_xlsx", {
      order_no: order.order_no,
      filename: `${filename}.xlsx`,
      rows: rows.length,
    });
  }

  function exportCsvFile() {
    if (!order) return;
    const rows = buildExportRows();
    const filename = `order-${order.order_no}`;
    downloadCsv(filename, rows, undefined, undefined, {
      storeName: "ร้านนัฐภรณ์ เชียงกลาง",
      subtitle: `คำสั่งซื้อ ${order.order_no} — ${fmtDateTime(order.created_at)}`,
    });
    void logOrderAction(order.id, "order_export_csv", {
      order_no: order.order_no,
      filename: `${filename}.csv`,
      rows: rows.length,
    });
  }

  async function copyTsv() {
    if (!order) return;
    const header = ["ลำดับ", "รหัสสินค้า", "รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม"].join("\t");
    const lines = items.map((i: any, idx: number) => [
      idx + 1,
      i.product_code || "",
      i.product_name,
      Number(i.qty),
      i.unit || "",
      Number(i.price || 0),
      Number(i.total || 0),
    ].join("\t"));
    const tsv = [header, ...lines].join("\n");
    if (await copyToClipboard(tsv)) toast.success("คัดลอกตารางแล้ว — วางใน Excel/Word ได้เลย");
    else toast.error("คัดลอกไม่สำเร็จ — เบราว์เซอร์ปฏิเสธสิทธิ์ clipboard");
  }

  async function copyText() {
    if (!order) return;
    const lines = items.map((i: any, idx: number) => {
      const price = Number(i.price || 0);
      const total = Number(i.total || 0);
      const priceStr = price > 0 ? ` @${price.toLocaleString("th-TH")}` : "";
      const totalStr = total > 0 ? ` = ${total.toLocaleString("th-TH")}` : "";
      return `${idx + 1}) ${i.product_name} x${Number(i.qty)} ${i.unit || ""}${priceStr}${totalStr}`.trim();
    });
    const body = [
      `คำสั่งซื้อ ${order.order_no}`,
      `วันที่ ${fmtDateTime(order.created_at)}`,
      "",
      ...lines,
      "",
      `ยอดรวม: ${fmtTHB(order.total || 0)}`,
    ].join("\n");
    if (await copyToClipboard(body)) toast.success("คัดลอกข้อความแล้ว — วางในแชท/เอกสารได้เลย");
    else toast.error("คัดลอกไม่สำเร็จ — เบราว์เซอร์ปฏิเสธสิทธิ์ clipboard");
  }

  async function downloadWorkOrderPdf() {
    if (!order) return;
    try {
      await downloadPdf(`work-order-${order.order_no}`, {
        kind: "quotation",
        docNo: order.order_no,
        date: order.created_at || new Date(),
        store: { name: "ร้านนัฐภรณ์ เชียงกลาง" },
        customer: {
          name: order.guest_name || session?.name || "ลูกค้า",
          phone: order.guest_phone || session?.phone,
          address: org?.address,
        },
        items: items.map((i: any) => ({
          name: i.product_name,
          code: i.product_code,
          qty: Number(i.qty),
          unit: i.unit,
          price: Number(i.price || 0),
          total: Number(i.total || 0),
        })),
        subtotal: Number(order.subtotal || 0),
        discount: Number(order.discount || 0),
        shippingFee: Number(order.shipping_fee || 0),
        total: Number(order.total || 0),
        note: order.note || undefined,
      });
      void logOrderAction(order.id, "order_pdf_download", {
        order_no: order.order_no,
        filename: `work-order-${order.order_no}.pdf`,
        rows: items.length,
      });
    } catch (e: any) {
      toast.error(e?.message || "ดาวน์โหลด PDF ไม่สำเร็จ");
    }
  }

  async function approve() {
    if (!order || !session) return;
    const { error } = await supabase.rpc("guest_approve_order", {
      p_guest_id: session.guest_id,
      p_phone: session.phone,
      p_order_id: order.id,
    });
    if (error) { toast.error("อนุมัติไม่สำเร็จ"); return; }
    toast.success("อนุมัติแล้ว ทางร้านจะจัดสินค้าให้");
    load();
  }

  if (loading) return <CustomerLayout><div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div></CustomerLayout>;
  if (error || !order) return (
    <CustomerLayout>
      <CustomerBreadcrumbs current="order-detail" orderId={id} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => nav("/my-orders")} className={customerNavyButtonClass}>
          <ArrowLeft className="w-4 h-4 mr-1" /> ประวัติคำสั่งซื้อ
        </Button>
        <Button variant="outline" size="sm" onClick={() => nav("/shop")} className={customerNavyButtonClass}>
          ช้อปต่อ
        </Button>
      </div>
      <div className="text-center py-12 text-destructive">{error || "ไม่พบคำสั่งซื้อ"}</div>
    </CustomerLayout>
  );

  const alreadyLinked = !!order.line_user_id;

  return (
    <CustomerLayout>
      <SeoHead
        title={`คำสั่งซื้อ ${order.order_no} — ร้านนัฐภรณ์ เชียงกลาง`}
        description={`รายละเอียดและสถานะของคำสั่งซื้อเลขที่ ${order.order_no}`}
        path={`/my-orders/${order.id}`}
      />
      <h1 className="sr-only">คำสั่งซื้อ {order.order_no}</h1>
      <CustomerBreadcrumbs current="order-detail" orderId={order.id} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => nav("/my-orders")} className={customerNavyButtonClass}>
          <ArrowLeft className="w-4 h-4 mr-1" /> ประวัติคำสั่งซื้อ
        </Button>
        <Button variant="outline" size="sm" onClick={() => nav("/shop")} className={customerNavyButtonClass}>
          ช้อปต่อ
        </Button>
      </div>
      {alreadyLinked && (
        <div className="mb-4 bg-success/10 border border-success/40 rounded-2xl p-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>ผูก LINE เรียบร้อย — คุณจะได้รับแจ้งเตือนสถานะออเดอร์นี้ผ่าน LINE โดยอัตโนมัติ</span>
        </div>
      )}

      <div className="bg-card rounded-2xl p-6 border border-border shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <div className="text-2xl font-bold text-primary">{order.order_no}</div>
            <div className="text-xs text-muted-foreground">{fmtDateTime(order.created_at)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              ในนาม {order.guest_name || session?.name} · {order.guest_phone || session?.phone}
              {org?.name ? ` · ${org.name}` : ""}
            </div>
            {order.customer_tax_id && (
              <div className="text-xs text-muted-foreground mt-0.5">
                เลขผู้เสียภาษี: <span className="font-mono text-foreground">{order.customer_tax_id}</span>
                {order.customer_branch ? ` (${order.customer_branch})` : ""}
              </div>
            )}
          </div>
          <span className={`px-3 py-1 text-sm rounded-full border ${ORDER_STATUS_COLOR[order.status]}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        </div>
        {notif && <div className="mb-4">{notifBadge()}</div>}

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border">
              <tr><th className="text-left py-2">สินค้า</th><th className="text-right">จำนวน</th><th className="text-right">ราคา</th><th className="text-right">รวม</th></tr>
            </thead>
            <tbody>
              {items.map((i: any) => (
                <tr key={i.id} className="border-b border-border/50">
                  <td className="py-2"><div className="text-xs text-muted-foreground">{i.product_code}</div>{i.product_name}</td>
                  <td className="text-right">{Number(i.qty)} {i.unit}</td>
                  <td className="text-right">{Number(i.price) > 0 ? fmtTHB(i.price) : "-"}</td>
                  <td className="text-right">{Number(i.total) > 0 ? fmtTHB(i.total) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 ml-auto md:max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>ยอดรวม</span><span>{fmtTHB(order.subtotal || 0)}</span></div>
          {Number(order.discount) > 0 && <div className="flex justify-between"><span>ส่วนลด</span><span>-{fmtTHB(order.discount)}</span></div>}
          {Number(order.shipping_fee) > 0 && <div className="flex justify-between"><span>ค่าจัดส่ง</span><span>{fmtTHB(order.shipping_fee)}</span></div>}
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-border"><span>รวมทั้งสิ้น</span><span className="text-primary">{fmtTHB(order.total || 0)}</span></div>
        </div>

        {order.note && <div className="mt-4 text-sm bg-accent rounded-xl p-3"><span className="text-muted-foreground">หมายเหตุ:</span> {order.note}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={downloadWorkOrderPdf}>
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลดใบสั่งจ้าง (PDF)
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileText className="w-4 h-4 mr-1" /> ดาวน์โหลด Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsvFile} data-testid="order-export-csv">
            <Download className="w-4 h-4 mr-1" /> ดาวน์โหลด CSV
          </Button>
          <Button size="sm" variant="outline" onClick={copyTsv}>
            <Clipboard className="w-4 h-4 mr-1" /> คัดลอกตาราง (Excel/Word)
          </Button>
          <Button size="sm" variant="outline" onClick={copyText}>
            <ClipboardList className="w-4 h-4 mr-1" /> คัดลอกข้อความ (แชท)
          </Button>
          {isAdminSurface && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="default">
                <FilePlus2 className="w-4 h-4 mr-1" /> นำไปสร้างเอกสารจริง
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>เลือกชนิดเอกสาร</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { t: "quotation", l: "ใบเสนอราคา" },
                { t: "sales_order", l: "ใบสั่งขาย" },
                { t: "delivery", l: "ใบส่งของ" },
                { t: "receipt", l: "ใบเสร็จรับเงิน" },
                { t: "tax_invoice", l: "ใบกำกับภาษี" },
              ].map((o) => (
                <DropdownMenuItem
                  key={o.t}
                  onClick={async () => {
                    const documentType = o.t === "sales_order" ? "quotation" : o.t;
                    // Save prefill payload so the receipts document form can pick it up.
                    try {
                      sessionStorage.setItem(
                        "doc_prefill_from_order",
                        JSON.stringify({
                          order_id: order.id,
                          order_no: order.order_no,
                          shop_id: order.shop_id || null,
                          type: documentType,
                          customer: {
                            name: order.guest_name || session?.name,
                            phone: order.guest_phone || session?.phone,
                            address: org?.address,
                            school: order.school_name || org?.name,
                            tax_id: order.customer_tax_id || null,
                            branch: order.customer_branch || null,
                          },
                          items: items.map((i: any) => ({
                            product_id: i.product_id || null,
                            code: i.product_code || "",
                            name: i.product_name,
                            qty: Number(i.qty),
                            unit: i.unit || "",
                            price: Number(i.price || 0),
                            total: Number(i.total || 0),
                          })),
                          subtotal: Number(order.subtotal || 0),
                          discount: Number(order.discount || 0),
                          shipping: Number(order.shipping_fee || 0),
                          total: Number(order.total || 0),
                          note: order.note || "",
                          captured_at: new Date().toISOString(),
                        }),
                      );
                    } catch { /* quota */ }
                    const storeSlug = await resolveReceiptStoreSlug(order);
                    const target = storeSlug
                      ? `/receipts/${storeSlug}/documents/new?prefill=order&type=${documentType}&order_id=${encodeURIComponent(order.id)}`
                      : `/receipts?prefill=order&type=${documentType}&order_id=${encodeURIComponent(order.id)}`;
                    nav(target);
                  }}
                >
                  {o.l}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          {isAdminSurface && (
          <Button
            size="sm"
            variant="default"
            data-testid="send-work-order-to-customer"
            onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("line-notify", {
                  body: { kind: "shop_work_order", order_id: order.id, idempotency_key: `manual-${Date.now()}` },
                });
                if (error) throw error;
                const admins = (data as any)?.results?.admin ?? {};
                const ok = Object.values(admins).some((r: any) => r?.ok);
                if (ok) toast.success("ส่งใบสั่งจ้างอิเล็กทรอนิกส์ให้ร้านแล้ว");
                else toast.error("ยังไม่มีแอดมินที่รับแจ้งเตือน");
              } catch (e: any) {
                toast.error(e?.message || "ส่งไม่สำเร็จ");
              }
            }}
          >
            <Send className="w-4 h-4 mr-1" /> ส่งใบสั่งจ้างอิเล็กทรอนิกส์ให้ลูกค้า
          </Button>
          )}
        </div>

        {(() => {
          // Only render the timeline container when the visitor proved
          // ownership via a matching link token. This mirrors the RPC's
          // access rule so we never render an empty box for someone who
          // followed a wrong /my-orders/:id?t=... link.
          const effectiveToken = linkToken || null;
          const canView = !!effectiveToken && effectiveToken === order.line_link_token;
          if (!canView) return null;
          return (
          <div className="mt-6 border-t border-border pt-4" data-testid="status-timeline">
          <div className="text-sm font-semibold mb-2">ประวัติสถานะ</div>
          {events.length === 0 ? (
            <div
              className="text-xs text-muted-foreground bg-accent/30 rounded-xl p-3"
              data-testid="status-timeline-empty"
            >
              ยังไม่มีประวัติสถานะสำหรับออเดอร์นี้ — ระบบจะอัปเดตให้อัตโนมัติเมื่อทางร้านดำเนินการ
            </div>
          ) : (
            <ol className="space-y-2 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-3" data-testid="status-event">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${ORDER_STATUS_COLOR[ev.status] || ""}`}>
                        {ORDER_STATUS_LABEL[ev.status] || ev.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{fmtDateTime(ev.created_at)}</span>
                    </div>
                    {ev.note && <div className="text-xs text-muted-foreground mt-0.5">{ev.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          </div>
          );
        })()}

        {isAdminSurface && (
          <div className="mt-6 border-t border-border pt-4">
            <OrderActivityTimeline orderId={order.id} />
          </div>
        )}

        {order.status === "quoted" && (
          <Button onClick={approve} className="mt-4 w-full md:w-auto rounded-xl bg-gradient-primary text-primary-foreground shadow-soft">
            <CheckCircle2 className="w-4 h-4 mr-2" /> ยืนยันสั่งซื้อตามราคานี้
          </Button>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv} className="rounded-xl">
            <Download className="w-4 h-4 mr-2" /> ดาวน์โหลด Excel
          </Button>
          <Button variant="outline" onClick={exportCsvFile} className="rounded-xl">
            <Download className="w-4 h-4 mr-2" /> ดาวน์โหลด CSV
          </Button>
          {shopLine && (
            <Button variant="outline" onClick={() => openLine(shopLine)} className="rounded-xl">
              แจ้งร้านผ่าน LINE
            </Button>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-border">
          <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-primary" /> ใบเสร็จรับเงินอิเล็กทรอนิกส์
            {order.receipt_issued_at ? (
              <Badge className="ml-2 bg-success text-white text-[10px]">✅ ออกแล้ว</Badge>
            ) : (
              <Badge variant="outline" className="ml-2 text-[10px]">🕓 ยังไม่ออก</Badge>
            )}
          </div>
          {order.receipt_issued_at ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                เลขที่: <span className="font-mono font-semibold text-foreground">{order.receipt_no}</span>
                {" · "}ออกเมื่อ {fmtDateTime(order.receipt_issued_at)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="rounded-xl bg-primary text-primary-foreground">
                  <Link to={`/my-orders/${order.id}/receipt`}>
                    <Receipt className="w-4 h-4 mr-2" /> 🧾 ดูใบเสร็จ
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link to={`/my-orders/${order.id}/receipt`}>
                    <FileText className="w-4 h-4 mr-2" /> 📥 ดาวน์โหลด PDF
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link to={`/my-orders/${order.id}/receipt`}>
                    <Printer className="w-4 h-4 mr-2" /> 🖨️ พิมพ์ใบเสร็จ
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-[#06C755] text-[#06C755] hover:bg-[#06C755]/10"
                  onClick={() => {
                    const url = `${window.location.origin}/my-orders/${order.id}/receipt`;
                    const line = `https://line.me/R/msg/text/?${encodeURIComponent(`ใบเสร็จเลขที่ ${order.receipt_no}\n${url}`)}`;
                    window.open(line, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Send className="w-4 h-4 mr-2" /> 📤 ส่งใบเสร็จผ่าน LINE
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground bg-accent/40 rounded-xl p-3">
              ใบเสร็จจะพร้อมดาวน์โหลดหลังจากชำระเงินแล้ว
            </div>
          )}
        </div>
      </div>
    </CustomerLayout>
  );
}