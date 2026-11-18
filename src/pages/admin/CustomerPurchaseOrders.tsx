import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Loader2, Plus, RefreshCw, Save, Search, Send, Trash2, FileCheck2, Lock, ClipboardCheck,
  ExternalLink, Pencil, PackagePlus, Eye, MailOpen, Mail, X,
} from "lucide-react";
import { toast } from "sonner";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import {
  bucketOf, canIssueDocument, cpoTotals, fmtMoney, itemTotal,
  CPO_REVIEW_LABEL, CPO_REVIEW_TONE, type CpoBucket, type CpoItem, type CpoReviewStatus,
} from "@/lib/customerPoTotals";
import { PoA4Preview } from "./customer-po/PoA4Preview";
import { CpoDetailDialog } from "./customer-po/CpoDetailDialog";
import {
  countUnread, emptyCpoFilters, filterCpoRows, loadCpoFilters, loadReadIds,
  orgOptions, saveCpoFilters, saveReadIds, type CpoFilterState,
} from "@/lib/cpoInbox";

import { buildConvertRoute, buildDocumentPrefill, type ConvertTarget, type PORow } from "@/pages/purchase-order/lib/convert";

const db = supabase as any;

type Row = PORow & {
  discount: number; vat_enabled: boolean; vat_rate: number; wht_enabled: boolean; wht_rate: number;
  net_total: number; review_status: CpoReviewStatus; revision_note: string;
  last_sent_at: string | null; confirmed_at: string | null; document_no: string | null; store_slug: string;
  updated_at: string;
};

/**
 * `review_token` is a bearer secret for the public /po/:token link, so it is
 * never selected into the browser. Staff fetch it on demand via the
 * `cpo_review_link` security-definer RPC.
 */
const CPO_COLUMNS = [
  "id", "po_number", "user_id", "customer_name", "customer_phone", "school_or_org", "seller_name",
  "document_date", "items", "subtotal", "note", "request_quotation", "request_delivery_note",
  "status", "source", "submitted_at", "created_at", "updated_at", "review_status", "discount",
  "vat_enabled", "vat_rate", "vat_amount", "wht_enabled", "wht_rate", "wht_amount", "net_total",
  "revision_note", "last_sent_at", "confirmed_at", "documented_at", "document_no", "document_id",
  "store_slug", "line_user_id",
].join(", ");

const STORES: Array<{ slug: string; name: string }> = [
  { slug: "colorlab", name: "นัฐภรณ์ คัลเลอร์แล็ป" },
  { slug: "printing", name: "นัฐภรณ์ การพิมพ์" },
  { slug: "film", name: "NATTAWORKS" },
];

const DOC_TARGETS: Array<{ value: ConvertTarget; label: string }> = [
  { value: "quotation", label: "ใบเสนอราคา" },
  { value: "delivery_note", label: "ใบส่งของ" },
  { value: "receipt", label: "ใบเสร็จ / ใบกำกับภาษี" },
];

const BUCKETS: Array<{ key: CpoBucket; label: string }> = [
  { key: "new", label: "ใหม่" },
  { key: "working", label: "กำลังดำเนินการ" },
  { key: "done", label: "เสร็จสิ้น" },
];

/** สถานะที่แอดมินเปลี่ยนเองได้จากหน้ารายการ */
const ADMIN_STATUS_OPTIONS: CpoReviewStatus[] = [
  "not_sent", "awaiting_customer", "revision_requested", "confirmed", "documented",
];

function toItems(raw: unknown): CpoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any, i: number) => ({
    key: String(r?.key ?? `i${i}`),
    name: String(r?.name ?? ""),
    quantity: Number(r?.quantity ?? 0) || 0,
    unit: String(r?.unit ?? "ชิ้น"),
    price: Number(r?.price ?? 0) || 0,
    discount: Number(r?.discount ?? 0) || 0,
  }));
}

export default function CustomerPurchaseOrders() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<CpoBucket>("new");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [target, setTarget] = useState<ConvertTarget>("quotation");
  const [filters, setFilters] = useState<CpoFilterState>(() => loadCpoFilters());
  const [readIds, setReadIds] = useState<Record<string, true>>(() => loadReadIds());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  // ลิงก์ด่วนจากแดชบอร์ด: ?review=&from=&to=&org=&unread=1 · ลิงก์จากไลน์: ?focus=<id> (ของเก่าใช้ ?order=<id>)
  useEffect(() => {
    const focus = searchParams.get("focus") || searchParams.get("order") || "";
    if (focus) setSelectedId(focus);
    const review = searchParams.get("review") as CpoReviewStatus | null;
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const orgParam = searchParams.get("org") || "";
    const unreadOnly = searchParams.get("unread") === "1";
    if (!review && !from && !to && !orgParam && !unreadOnly) return;
    if (review) setBucket(bucketOf(review));
    setFilters((prev) => {
      const next = {
        ...prev,
        statuses: review ? [review] : prev.statuses,
        from: from || prev.from,
        to: to || prev.to,
        org: orgParam || prev.org,
        unreadOnly: unreadOnly || prev.unreadOnly,
      };
      saveCpoFilters(next);
      return next;
    });
  }, [searchParams]);

  // ลิงก์เก่าจากไลน์ (?order=<id>) อาจเป็นออเดอร์จากเว็บแอปลูกค้า ซึ่งไม่ได้อยู่ใน
  // customer_purchase_orders — ส่งต่อไปตัวแก้ปลายทาง /admin/orders/:id แทนที่จะขึ้น "ไม่มีในระบบ"
  useEffect(() => {
    const id = searchParams.get("focus") || searchParams.get("order") || "";
    if (!id) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("customer_purchase_orders").select("id").eq("id", id).maybeSingle();
      if (!alive || data?.id) return;
      nav(`/admin/orders/${id}`, { replace: true });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  // editor state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [org, setOrg] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<CpoItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(7);
  const [whtEnabled, setWhtEnabled] = useState(false);
  const [whtRate, setWhtRate] = useState(3);
  const [storeSlug, setStoreSlug] = useState("printing");
  const [dirty, setDirty] = useState(false);

  const saveGuard = useSubmitGuard();
  const sendGuard = useSubmitGuard();
  const issueGuard = useSubmitGuard();
  const orderGuard = useSubmitGuard();

  const load = useCallback(async (keepId?: string | null) => {
    setLoading(true);
    const { data, error } = await db
      .from("customer_purchase_orders")
      .select(CPO_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    const list = (data ?? []) as Row[];
    setRows(list);
    setLoading(false);
    if (keepId) setSelectedId(keepId);
    // อย่าทับรายการที่ถูกโฟกัสมาจากลิงก์ (?focus=) — เลือกรายการแรกเฉพาะตอนยังไม่มีอะไรถูกเลือก
    else if (list.length) setSelectedId((cur) => cur ?? list[0].id);
  }, [selectedId]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  // Hydrate the editor whenever the selected order changes.
  useEffect(() => {
    if (!selected) return;
    setCustomerName(selected.customer_name || "");
    setCustomerPhone(selected.customer_phone || "");
    setOrg(selected.school_or_org || "");
    setNote(selected.note || "");
    setItems(toItems(selected.items));
    setDiscount(Number(selected.discount || 0));
    setVatEnabled(Boolean(selected.vat_enabled));
    setVatRate(Number(selected.vat_rate || 7));
    setWhtEnabled(Boolean(selected.wht_enabled));
    setWhtRate(Number(selected.wht_rate || 3));
    setStoreSlug(selected.store_slug || "printing");
    setDirty(false);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () => cpoTotals({ items, discount, vat_enabled: vatEnabled, vat_rate: vatRate, wht_enabled: whtEnabled, wht_rate: whtRate }),
    [items, discount, vatEnabled, vatRate, whtEnabled, whtRate],
  );

  const visible = useMemo(() => rows.filter((r) => {
    if (bucketOf(r.review_status) !== bucket) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [r.po_number, r.customer_name, r.customer_phone].some((v) => String(v || "").toLowerCase().includes(t));
  }), [rows, bucket, q]);

  const filtered = useMemo(() => filterCpoRows(visible, filters, readIds), [visible, filters, readIds]);
  const orgs = useMemo(() => orgOptions(rows), [rows]);
  const unread = useMemo(() => countUnread(rows, readIds), [rows, readIds]);

  const patchFilters = useCallback((patch: Partial<CpoFilterState>) => {
    setFilters((prev) => { const next = { ...prev, ...patch }; saveCpoFilters(next); return next; });
  }, []);

  const markRead = useCallback((id: string, read = true) => {
    setReadIds((prev) => {
      const next = { ...prev };
      if (read) next[id] = true; else delete next[id];
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = { ...prev };
      rows.forEach((r) => { next[r.id] = true; });
      saveReadIds(next);
      return next;
    });
  }, [rows]);

  /** แอดมินเปลี่ยนสถานะเอง + บันทึกประวัติ */
  async function changeStatus(row: Row, next: CpoReviewStatus) {
    if (next === row.review_status) return;
    setStatusBusy(row.id);
    const payload: Record<string, unknown> = { review_status: next };
    if (next === "confirmed") payload.confirmed_at = new Date().toISOString();
    if (next === "not_sent") payload.confirmed_at = null;
    const { data, error } = await db.from("customer_purchase_orders")
      .update(payload).eq("id", row.id).select(CPO_COLUMNS).maybeSingle();
    setStatusBusy(null);
    if (error) { toast.error(error.message); return; }
    await db.from("customer_po_review_events").insert({
      po_id: row.id,
      event: "status_changed",
      note: `${CPO_REVIEW_LABEL[row.review_status as CpoReviewStatus] ?? row.review_status} → ${CPO_REVIEW_LABEL[next]}`,
      actor: "staff",
    });
    const updated = (data as Row) ?? { ...row, review_status: next };
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    markRead(row.id);
    toast.success(`เปลี่ยนสถานะเป็น “${CPO_REVIEW_LABEL[next]}” แล้ว`);
  }

  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  function updateItem(key: string, patch: Partial<CpoItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    setDirty(true);
  }

  function addItem() {
    setItems((prev) => [...prev, { key: `n${Date.now()}${prev.length}`, name: "", quantity: 1, unit: "ชิ้น", price: 0, discount: 0 }]);
    setDirty(true);
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
    setDirty(true);
  }

  async function createOrder() {
    const year = new Date().getFullYear();
    const poNumber = `PO-${year}-${String(Date.now()).slice(-6)}`;
    const { data, error } = await db
      .from("customer_purchase_orders")
      .insert({
        po_number: poNumber, customer_name: "", customer_phone: "", school_or_org: "",
        items: [], subtotal: 0, net_total: 0, status: "draft", source: "admin", review_status: "not_sent",
      })
      .select(CPO_COLUMNS)
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    setBucket("new");
    await load((data as Row)?.id);
    toast.success("สร้างคำสั่งซื้อใหม่แล้ว");
  }

  /** Save the draft. Editing a confirmed order resets it to "รอลูกค้าตรวจ". */
  async function saveDraft(silent = false): Promise<Row | null> {
    if (!selected) return null;
    const resetsReview = dirty && (selected.review_status === "confirmed" || selected.review_status === "revision_requested");
    const payload: Record<string, unknown> = {
      customer_name: customerName, customer_phone: customerPhone, school_or_org: org, note,
      items, subtotal: totals.subtotal, discount,
      vat_enabled: vatEnabled, vat_rate: vatRate, vat_amount: totals.vat,
      wht_enabled: whtEnabled, wht_rate: whtRate, wht_amount: totals.wht,
      net_total: totals.net, store_slug: storeSlug,
    };
    if (resetsReview) { payload.review_status = "awaiting_customer"; payload.confirmed_at = null; }
    const { data, error } = await db.from("customer_purchase_orders").update(payload).eq("id", selected.id).select(CPO_COLUMNS).maybeSingle();
    if (error) { toast.error(error.message); return null; }
    if (resetsReview) {
      await db.from("customer_po_review_events").insert({
        po_id: selected.id, event: "edited_after_confirm", note: "แก้ไขรายการหลังลูกค้ายืนยัน — ต้องส่งตรวจใหม่", actor: "staff",
      });
      toast.warning("แก้ไขหลังลูกค้ายืนยัน — สถานะกลับเป็น “รอลูกค้าตรวจ” ต้องส่งตรวจใหม่");
    }
    const row = data as Row;
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    setDirty(false);
    if (!silent) toast.success("บันทึกร่างแล้ว (ยังไม่สร้างเลขเอกสารจริง)");
    return row;
  }

  async function sendToCustomer() {
    if (!selected) return;
    if (!items.length) { toast.error("ยังไม่มีรายการสินค้า"); return; }
    const saved = await saveDraft(true);
    if (!saved) return;
    const { data, error } = await supabase.functions.invoke("po-review", {
      body: { action: "send", po_id: selected.id, origin: window.location.origin },
    });
    if (error) { toast.error("ส่งไม่สำเร็จ: " + error.message); return; }
    const res = data as any;
    if (res?.error) { toast.error(res.error); return; }
    await load(selected.id);
    setBucket("working");
    if (res?.queued) toast.success("ส่งลิงก์ตรวจสอบให้ลูกค้าทาง LINE แล้ว");
    else toast.warning("บันทึกสถานะรอลูกค้าตรวจแล้ว แต่ยังไม่พบ LINE ของลูกค้า — คัดลอกลิงก์ส่งเองได้");
    if (res?.url) {
      try { await navigator.clipboard.writeText(res.url); } catch { /* ignore */ }
    }
  }

  async function issueDocument() {
    if (!selected) return;
    if (!canIssueDocument(selected.review_status)) return;
    const saved = await saveDraft(true);
    if (!saved) return;
    await db.from("customer_purchase_orders")
      .update({ review_status: "documented", documented_at: new Date().toISOString(), status: "converted" })
      .eq("id", selected.id)
      .eq("review_status", "confirmed");
    await db.from("customer_po_review_events").insert({
      po_id: selected.id, event: "document_issued", note: `${storeSlug} · ${target}`, actor: "staff",
    });
    const prefill = buildDocumentPrefill({ ...(saved as any), items } as PORow, target);
    nav(buildConvertRoute(storeSlug, target, selected.id), { state: { prefill } });
  }

  /** Delete a customer purchase order (and its review events). */
  async function deleteOrder(row: Row) {
    if (!window.confirm(`ลบคำสั่งซื้อ ${row.po_number || ""} ?\nการลบไม่สามารถย้อนกลับได้`)) return;
    await db.from("customer_po_review_events").delete().eq("po_id", row.id);
    const { error } = await db.from("customer_purchase_orders").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    if (selectedId === row.id) setSelectedId(null);
    toast.success("ลบคำสั่งซื้อแล้ว");
  }

  /** Open what the customer sees / ordered. */
  async function openCustomerView(row: Row) {
    // The review token is a bearer secret: fetch it server-side (staff only).
    const { data, error } = await db.rpc("cpo_review_link", { p_id: row.id });
    const token = typeof data === "string" ? data : null;
    if (error || !token) { toast.info("ยังไม่ได้ส่งให้ลูกค้าตรวจ — กด “ส่งให้ลูกค้าตรวจ” เพื่อสร้างลิงก์"); return; }
    window.open(`/po/${token}`, "_blank", "noopener");
  }

  /** Save the current draft straight into the Film Shop order book (ใบออเดอร์). */
  async function saveAsFilmOrder() {
    if (!selected) return;
    if (!items.length) { toast.error("ยังไม่มีรายการสินค้า"); return; }
    const saved = await saveDraft(true);
    if (!saved) return;

    let orderNo = "";
    const { data: nextNo } = await db.rpc("film_next_order_number");
    orderNo = (typeof nextNo === "string" && nextNo) ? nextNo : `OR-${Date.now().toString().slice(-8)}`;

    const { data: orderRow, error: insErr } = await db.from("film_orders").insert({
      order_no: orderNo,
      customer_name: customerName || "(ยังไม่ระบุ)",
      customer_phone: customerPhone || null,
      org_name: org || null,
      channel: "walkin",
      title: `จากคำสั่งซื้อ ${selected.po_number || ""}`.trim(),
      status: "waiting_info",
      payment_status: "unpaid",
      subtotal: totals.subtotal,
      discount,
      vat_rate: vatEnabled ? vatRate : 0,
      vat_amount: totals.vat,
      total: totals.net,
      notes: [note, selected.po_number ? `อ้างอิงคำสั่งซื้อ ${selected.po_number}` : ""].filter(Boolean).join("\n") || null,
    }).select("id, order_no").maybeSingle();
    if (insErr || !orderRow) { toast.error("บันทึกใบออเดอร์ไม่สำเร็จ: " + (insErr?.message ?? "")); return; }

    const { error: itemErr } = await db.from("film_order_items").insert(
      items.map((it, idx) => ({
        order_id: (orderRow as any).id,
        description: it.name || "รายการ",
        quantity: it.quantity,
        unit: it.unit || "ชิ้น",
        unit_price: it.price,
        total: itemTotal(it),
        sort_order: idx,
      })),
    );
    if (itemErr) toast.warning("บันทึกออเดอร์แล้ว แต่บางรายการไม่ถูกบันทึก: " + itemErr.message);

    await db.from("customer_po_review_events").insert({
      po_id: selected.id, event: "saved_as_order", note: `ใบออเดอร์ ${(orderRow as any).order_no}`, actor: "staff",
    });
    toast.success(`บันทึกเป็นใบออเดอร์ ${(orderRow as any).order_no} แล้ว`, {
      action: { label: "เปิดออเดอร์", onClick: () => nav("/film-shop/app?p=orders") },
    });
  }

  const reviewStatus = (selected?.review_status ?? "not_sent") as CpoReviewStatus;
  const locked = !canIssueDocument(reviewStatus) || dirty;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-blue-900">
            คำสั่งซื้อใหม่
            <Badge className="bg-blue-600 hover:bg-blue-600">{rows.length}</Badge>
            {unread > 0 && (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700" data-testid="cpo-unread-count">
                ยังไม่อ่าน {unread}
              </Badge>
            )}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unread} data-testid="cpo-mark-all-read">
              <MailOpen className="mr-1 h-4 w-4" /> อ่านทั้งหมด
            </Button>
            <Button variant="outline" size="sm" onClick={() => load(selectedId)}>
              <RefreshCw className="mr-1 h-4 w-4" /> รีเฟรช
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={createOrder} data-testid="cpo-new">
              <Plus className="mr-1 h-4 w-4" /> สร้างคำสั่งซื้อ
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------------ list */}
          <div className="space-y-3">
            <Card className="flex flex-wrap items-center gap-2 rounded-2xl border-slate-200 p-3">
              <div className="flex min-w-48 flex-1 items-center gap-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / ชื่อลูกค้า / เบอร์โทร" className="border-0 focus-visible:ring-0" />
              </div>
              <div className="flex rounded-lg bg-slate-100 p-1">
                {BUCKETS.map((b) => (
                  <button
                    key={b.key}
                    onClick={() => setBucket(b.key)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${bucket === b.key ? "bg-blue-600 text-white" : "text-slate-600"}`}
                    data-testid={`cpo-tab-${b.key}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </Card>

            {/* ตัวกรอง: ช่วงวันที่ / สถานะ / หน่วยงาน (จำค่าที่เลือกไว้) */}
            <Card className="space-y-2 rounded-2xl border-slate-200 p-3" data-testid="cpo-filters">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">ช่วงวันที่</span>
                <Input
                  type="date" className="h-9 w-40" value={filters.from} data-testid="cpo-filter-from"
                  onChange={(e) => patchFilters({ from: e.target.value })}
                />
                <span className="text-xs text-slate-400">ถึง</span>
                <Input
                  type="date" className="h-9 w-40" value={filters.to} data-testid="cpo-filter-to"
                  onChange={(e) => patchFilters({ to: e.target.value })}
                />
                <Select
                  value={filters.org || "__all"}
                  onValueChange={(v) => patchFilters({ org: v === "__all" ? "" : v })}
                >
                  <SelectTrigger className="h-9 w-52" data-testid="cpo-filter-org"><SelectValue placeholder="ทุกหน่วยงาน" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">ทุกหน่วยงาน</SelectItem>
                    {orgs.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={filters.unreadOnly ? "default" : "outline"}
                  className={filters.unreadOnly ? "bg-rose-600 hover:bg-rose-700" : ""}
                  onClick={() => patchFilters({ unreadOnly: !filters.unreadOnly })}
                  data-testid="cpo-filter-unread"
                >
                  <Mail className="mr-1 h-4 w-4" /> เฉพาะยังไม่อ่าน
                </Button>
                <Button
                  size="sm" variant="ghost" className="text-slate-500"
                  onClick={() => { setFilters(emptyCpoFilters); saveCpoFilters(emptyCpoFilters); }}
                  data-testid="cpo-filter-reset"
                >
                  <X className="mr-1 h-4 w-4" /> ล้างตัวกรอง
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ADMIN_STATUS_OPTIONS.map((s) => {
                  const on = filters.statuses.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      data-testid={`cpo-filter-status-${s}`}
                      onClick={() => patchFilters({
                        statuses: on ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s],
                      })}
                      className={`rounded-full border px-3 py-1 text-xs transition ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {CPO_REVIEW_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200">
              <div className="max-h-[62vh] overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-slate-500">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">เลขที่</th>
                      <th className="px-3 py-2 text-left">ลูกค้า</th>
                      <th className="px-3 py-2 text-right">ยอดรวม</th>
                      <th className="px-3 py-2 text-left">สถานะ</th>
                      <th className="px-3 py-2 text-left">วันที่</th>
                      <th className="px-3 py-2 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">ไม่มีคำสั่งซื้อในสถานะนี้</td></tr>
                    ) : filtered.map((r) => (
                      <tr
                        key={r.id}
                        data-unread={readIds[r.id] ? undefined : "true"}
                        className={`border-b last:border-0 hover:bg-blue-50/60 ${r.id === selectedId ? "bg-blue-50" : ""} ${readIds[r.id] ? "" : "bg-rose-50/40"}`}
                      >
                        <td className="px-3 py-3 font-medium text-blue-700">
                          <span className="inline-flex items-center gap-1.5">
                            {!readIds[r.id] && <span className="h-2 w-2 rounded-full bg-rose-500" aria-label="ยังไม่อ่าน" />}
                            {r.po_number || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-800">{r.customer_name || "(ยังไม่ระบุ)"}</div>
                          <div className="text-xs text-slate-500">{r.customer_phone || "-"}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(r.net_total || r.subtotal)}<div className="text-xs text-slate-400">บาท</div></td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <Badge variant="outline" className={CPO_REVIEW_TONE[r.review_status as CpoReviewStatus]}>
                              {CPO_REVIEW_LABEL[r.review_status as CpoReviewStatus] ?? r.review_status}
                            </Badge>
                            <Select
                              value={r.review_status}
                              onValueChange={(v) => changeStatus(r, v as CpoReviewStatus)}
                            >
                              <SelectTrigger className="h-8 w-40 text-xs" data-testid={`cpo-status-${r.po_number}`} disabled={statusBusy === r.id}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ADMIN_STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s}>{CPO_REVIEW_LABEL[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => { setDetailId(r.id); markRead(r.id); }}
                              data-testid={`cpo-detail-${r.po_number}`}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" /> รายละเอียด
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="text-slate-500"
                              onClick={() => markRead(r.id, !!readIds[r.id] ? false : true)}
                              data-testid={`cpo-read-${r.po_number}`}
                            >
                              {readIds[r.id] ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)} data-testid={`cpo-open-${r.po_number}`}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> แก้ไข
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openCustomerView(r)} data-testid={`cpo-customer-view-${r.po_number}`}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" /> รายการลูกค้าสั่ง
                            </Button>
                            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => deleteOrder(r)} aria-label="ลบคำสั่งซื้อ" data-testid={`cpo-delete-${r.po_number}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t px-3 py-2 text-xs text-slate-500">แสดง {filtered.length} จาก {rows.length} รายการ · ยังไม่อ่าน {unread}</div>
            </Card>
          </div>

          {/* ---------------------------------------------------- editor */}
          <Card className="flex max-h-[86vh] flex-col overflow-hidden rounded-2xl border-slate-200">
            <div className="flex items-start gap-3 border-b p-4">
              <div className="rounded-xl bg-blue-600 p-2 text-white"><ClipboardList className="h-5 w-5" /></div>
              <div>
                <div className="text-lg font-bold text-blue-900">จัดทำและส่งตรวจออเดอร์</div>
                <div className="text-xs text-slate-500">แก้ไขรายการและคำนวณยอดก่อนออกเอกสารจริง</div>
              </div>
            </div>

            <Steps status={reviewStatus} />

            {!selected ? (
              <div className="p-8 text-center text-sm text-muted-foreground">เลือกคำสั่งซื้อจากรายการ หรือกด “สร้างคำสั่งซื้อ”</div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="ลูกค้า">
                      <Input value={customerName} onChange={(e) => touch(setCustomerName)(e.target.value)} placeholder="ชื่อลูกค้า" />
                    </Field>
                    <Field label="เบอร์โทร">
                      <Input value={customerPhone} onChange={(e) => touch(setCustomerPhone)(e.target.value)} placeholder="08x-xxx-xxxx" />
                    </Field>
                    <Field label="โรงเรียน / หน่วยงาน">
                      <Input value={org} onChange={(e) => touch(setOrg)(e.target.value)} />
                    </Field>
                    <Field label="ร้านที่จะออกเอกสาร">
                      <Select value={storeSlug} onValueChange={(v) => touch(setStoreSlug)(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STORES.map((s) => <SelectItem key={s.slug} value={s.slug}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[540px] text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-2 py-2 text-left">รายการ</th>
                          <th className="px-2 py-2 text-left w-20">จำนวน</th>
                          <th className="px-2 py-2 text-left w-20">หน่วย</th>
                          <th className="px-2 py-2 text-left w-24">ราคา</th>
                          <th className="px-2 py-2 text-left w-24">ส่วนลด</th>
                          <th className="px-2 py-2 text-right w-24">รวม</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.key} className="border-t">
                            <td className="px-2 py-1"><Input value={it.name} onChange={(e) => updateItem(it.key, { name: e.target.value })} placeholder="ชื่อรายการ" /></td>
                            <td className="px-2 py-1"><Input type="number" inputMode="decimal" value={it.quantity} onChange={(e) => updateItem(it.key, { quantity: Number(e.target.value) || 0 })} /></td>
                            <td className="px-2 py-1"><Input value={it.unit} onChange={(e) => updateItem(it.key, { unit: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input type="number" inputMode="decimal" value={it.price} onChange={(e) => updateItem(it.key, { price: Number(e.target.value) || 0 })} /></td>
                            <td className="px-2 py-1"><Input type="number" inputMode="decimal" value={it.discount ?? 0} onChange={(e) => updateItem(it.key, { discount: Number(e.target.value) || 0 })} /></td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtMoney(itemTotal(it))}</td>
                            <td className="px-1">
                              <Button size="icon" variant="ghost" onClick={() => removeItem(it.key)} aria-label="ลบรายการ">
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {items.length === 0 && (
                          <tr><td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Button variant="outline" className="w-full border-dashed border-blue-300 text-blue-700" onClick={addItem} data-testid="cpo-add-item">
                    <Plus className="mr-1 h-4 w-4" /> เพิ่มรายการ
                  </Button>

                  <div className="space-y-2 rounded-xl border p-3 text-sm">
                    <SumRow label="ยอดสินค้า" value={`${fmtMoney(totals.subtotal)} บาท`} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">ส่วนลดท้ายบิล</span>
                      <div className="flex items-center gap-1">
                        <Input type="number" inputMode="decimal" className="w-28 text-right" value={discount} onChange={(e) => touch(setDiscount)(Number(e.target.value) || 0)} />
                        <span className="text-xs text-slate-500">บาท</span>
                      </div>
                    </div>
                    <SumRow label="ยอดก่อนภาษี" value={`${fmtMoney(totals.base)} บาท`} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">VAT {vatRate}%</span>
                      <div className="flex items-center gap-2">
                        <Switch checked={vatEnabled} onCheckedChange={(v) => touch(setVatEnabled)(v)} data-testid="cpo-vat" />
                        <span className="w-24 text-right tabular-nums">{fmtMoney(totals.vat)}</span>
                        <span className="text-xs text-slate-500">บาท</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">หัก ณ ที่จ่าย {whtRate}%</span>
                      <div className="flex items-center gap-2">
                        <Switch checked={whtEnabled} onCheckedChange={(v) => touch(setWhtEnabled)(v)} data-testid="cpo-wht" />
                        <span className="w-24 text-right tabular-nums">-{fmtMoney(totals.wht)}</span>
                        <span className="text-xs text-slate-500">บาท</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2 text-base font-bold text-blue-900">
                      <span>ยอดสุทธิ</span>
                      <span className="tabular-nums" data-testid="cpo-net">{fmtMoney(totals.net)} บาท</span>
                    </div>
                  </div>

                  <Textarea value={note} onChange={(e) => touch(setNote)(e.target.value)} placeholder="หมายเหตุถึงลูกค้า" rows={2} />

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ฉบับร่าง สามารถแก้ไขได้ และยังไม่สร้างเลขเอกสารจริง
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-blue-900">สถานะลูกค้า: {CPO_REVIEW_LABEL[reviewStatus]}</div>
                      <Select value={target} onValueChange={(v) => setTarget(v as ConvertTarget)}>
                        <SelectTrigger className="h-8 w-52 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DOC_TARGETS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-1 text-xs text-blue-800/80">
                      {reviewStatus === "confirmed"
                        ? "ลูกค้ายืนยันแล้ว — ออกเอกสารจริงได้"
                        : "เมื่อลูกค้ายืนยันแล้ว จึงสามารถออกเอกสารจริงได้"}
                    </div>
                    {selected.revision_note && (
                      <div className="mt-2 rounded-lg bg-white p-2 text-xs text-amber-800">
                        ลูกค้าขอแก้ไข: {selected.revision_note}
                      </div>
                    )}
                    {selected.last_sent_at && (
                      <div className="mt-1 text-[11px] text-slate-500">ส่งตรวจล่าสุด {new Date(selected.last_sent_at).toLocaleString("th-TH")}</div>
                    )}
                  </div>
                </div>

                {/* sticky action bar — always visible */}
                <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-white p-3">
                  <Button variant="outline" disabled={saveGuard.busy} onClick={() => saveGuard.run(() => saveDraft())} data-testid="cpo-save-draft">
                    <Save className="mr-1 h-4 w-4" /> บันทึกร่าง
                  </Button>
                  <Button className="bg-blue-600 hover:bg-blue-700" disabled={sendGuard.busy} onClick={() => sendGuard.run(sendToCustomer)} data-testid="cpo-send">
                    {sendGuard.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} ส่งให้ลูกค้าตรวจ
                  </Button>
                  <Button variant="outline" onClick={() => setPreview(true)} data-testid="cpo-preview">
                    <ClipboardCheck className="mr-1 h-4 w-4" /> ดูตัวอย่าง A4
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={orderGuard.busy}
                    onClick={() => orderGuard.run(saveAsFilmOrder)}
                    data-testid="cpo-save-order"
                  >
                    {orderGuard.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1 h-4 w-4" />} บันทึกเป็นใบออเดอร์
                  </Button>
                  <Button variant="outline" className="text-rose-600" onClick={() => deleteOrder(selected)} data-testid="cpo-delete-current">
                    <Trash2 className="mr-1 h-4 w-4" /> ลบคำสั่งซื้อ
                  </Button>
                  <Button
                    className="bg-blue-900 hover:bg-blue-950 disabled:opacity-50"
                    disabled={locked || issueGuard.busy}
                    onClick={() => issueGuard.run(issueDocument)}
                    data-testid="cpo-issue"
                    title={locked ? "ต้องรอลูกค้ายืนยันก่อน" : undefined}
                  >
                    {locked ? <Lock className="mr-1 h-4 w-4" /> : <FileCheck2 className="mr-1 h-4 w-4" />} ออกเอกสารจริง
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
        </>

      </div>


      <PoA4Preview
        open={preview}
        onOpenChange={setPreview}
        poNumber={selected?.po_number || ""}
        customerName={customerName}
        org={org}
        phone={customerPhone}
        items={items}
        totals={totals}
        discount={discount}
        vatEnabled={vatEnabled}
        vatRate={vatRate}
        whtEnabled={whtEnabled}
        whtRate={whtRate}
        note={note}
      />

      <CpoDetailDialog
        row={(rows.find((r) => r.id === detailId) as any) ?? null}
        items={toItems(rows.find((r) => r.id === detailId)?.items)}
        onClose={() => setDetailId(null)}
      />
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Steps({ status }: { status: CpoReviewStatus }) {
  const step = status === "documented" ? 4 : status === "confirmed" ? 3 : status === "not_sent" ? 1 : 3;
  const labels = ["แก้ไขรายการ", "ตรวจยอด", "ส่งลูกค้าตรวจ", "ออกเอกสารจริง"];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-slate-50 px-4 py-2 text-xs">
      {labels.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i + 1 <= step ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1}</span>
          <span className={i + 1 <= step ? "text-blue-700" : "text-slate-500"}>{l}</span>
          {i < labels.length - 1 && <span className="text-slate-300">›</span>}
        </span>
      ))}
    </div>
  );
}