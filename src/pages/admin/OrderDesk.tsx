/**
 * หน้า "จัดการคำสั่งซื้อ" — ทำงานครบทุกขั้นตอนในหน้าเดียว
 * ตรวจไฟล์ → สร้างรายการ → ตรวจยอด → บันทึก
 *
 * ใช้ข้อมูลเดิมของระบบผ่าน `@/lib/orderDesk` (customer_purchase_orders ฯลฯ)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Save, Trash2, Pencil, Phone, CalendarDays, School, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, Image as ImageIcon, FileType2, MessageCircle, History, Send, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cpoTotals, fmtMoney, itemTotal, type CpoItem } from "@/lib/customerPoTotals";
import {
  DESK_STAGES, DESK_TABS, DESK_TAB_TONE, NOTIFY_LABELS, NOTIFY_STATUS_LABEL, RECEIVE_METHODS,
  RECIPIENT_LABEL, isDisabledRecipient, STAGE_LABELS, UNIT_OPTIONS,
  commitDeskOrder, fmtSize, fmtWhen, listDeskEvents, listDeskFiles, listDeskOrders, listNotifyLogs,
  loadDelivery, maskLineId, notifyOrderLine, saveDelivery, saveDeskDraft, saveDeskStage,
  shortCustomerId, tabOfOrder,
  type DeliveryInfo, type DeskEvent, type DeskFile, type DeskOrder, type DeskStage,
  type DeskTab, type NotifyLog, type NotifyType,
} from "@/lib/orderDesk";

import { FilePreviewDialog } from "./order-desk/FilePreviewDialog";

const PURPLE = "#5B258B";
const STEPS = DESK_STAGES.map((s) => STAGE_LABELS[s]);
const STATUS_ACTIONS: NotifyType[] = [
  "order_accepted", "awaiting_quote", "price_informed", "ready_for_pickup", "info_requested", "order_cancelled",
];

const FileIcon = ({ kind }: { kind: DeskFile["kind"] }) => {
  if (kind === "excel") return <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-[#E9F7EF]"><FileSpreadsheet className="h-5 w-5 text-[#1B7F4B]" /></span>;
  if (kind === "pdf") return <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-[#FDECEC]"><FileText className="h-5 w-5 text-[#C2352F]" /></span>;
  if (kind === "word") return <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-[#EAF3FD]"><FileType2 className="h-5 w-5 text-[#1D6FD0]" /></span>;
  return <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-[#F1EEF7]"><ImageIcon className="h-5 w-5 text-[#5B258B]" /></span>;
};

export default function OrderDesk() {
  const [orders, setOrders] = useState<DeskOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DeskTab>("new");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [files, setFiles] = useState<DeskFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, true>>({});
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const [items, setItems] = useState<CpoItem[]>([]);
  const [delivery, setDelivery] = useState<DeliveryInfo>({ dueDate: "", method: RECEIVE_METHODS[0], note: "" });
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<"" | "draft" | "commit" | "notify">("");
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<DeskEvent[]>([]);
  const [logs, setLogs] = useState<NotifyLog[]>([]);




  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const list = await listDeskOrders();
      setOrders(list);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => orders.find((o) => o.id === selectedId) ?? null, [orders, selectedId]);

  const refreshSide = useCallback(async (order: DeskOrder) => {
    if (order.demo) { setEvents([]); setLogs([]); return; }
    const [ev, lg] = await Promise.all([listDeskEvents(order.id), listNotifyLogs(order.id)]);
    setEvents(ev); setLogs(lg);
  }, []);

  useEffect(() => {
    if (!selected) { setFiles([]); setItems([]); setEvents([]); setLogs([]); return; }
    setItems(selected.items);
    setDelivery(loadDelivery(selected));
    setPicked({}); setInvalid({});
    setStep(Math.max(0, DESK_STAGES.indexOf(selected.stage ?? "files")));
    setFilesLoading(true);
    listDeskFiles(selected)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setFilesLoading(false));
    void refreshSide(selected);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (tabOfOrder(o) !== tab) return false;
      if (!t) return true;
      return [o.customerName, o.org, o.poNumber, shortCustomerId(o), o.phone]
        .some((v) => String(v || "").toLowerCase().includes(t));
    });
  }, [orders, tab, q]);

  const counts = useMemo(() => {
    const c: Record<DeskTab, number> = { new: 0, checking: 0, pricing: 0, done: 0 };
    orders.forEach((o) => { c[tabOfOrder(o)] += 1; });
    return c;
  }, [orders]);

  const failedLogs = useMemo(
    () => logs.filter((l) => l.status === "failed" && !isDisabledRecipient(l.recipientType)),
    [logs],
  );

  const totals = useMemo(
    () => cpoTotals({ items, vat_enabled: true, vat_rate: 7 }),
    [items],
  );
  const preVat = useMemo(() => Math.round((totals.subtotal / 1.07) * 100) / 100, [totals.subtotal]);
  const vat = useMemo(() => Math.round((totals.subtotal - preVat) * 100) / 100, [totals.subtotal, preVat]);

  const pickedIds = Object.keys(picked);

  /* ---------------------------------------------------------------- actions */

  function togglePick(id: string) {
    setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  }

  function pickAll() {
    if (pickedIds.length === files.length) setPicked({});
    else setPicked(Object.fromEntries(files.map((f) => [f.id, true as const])));
  }

  /** เลื่อนขั้นตอน + บันทึกลงฐานข้อมูลพร้อมประวัติ */
  const advance = useCallback((stage: DeskStage, note?: string) => {
    const idx = DESK_STAGES.indexOf(stage);
    setStep((s) => Math.max(s, idx));
    const order = selected;
    if (!order || order.demo) return;
    if (DESK_STAGES.indexOf(order.stage ?? "files") >= idx && stage !== "saved") return;
    setOrders((p) => p.map((o) => (o.id === order.id ? { ...o, stage } : o)));
    void saveDeskStage(order, stage, note).then(() => refreshSide({ ...order, stage })).catch(() => undefined);
  }, [selected, refreshSide]);

  function buildFromFiles() {
    const src = files.filter((f) => picked[f.id]);
    const rows = src.flatMap((f) => f.items ?? []);
    if (!rows.length) { toast.error("ไฟล์ที่เลือกยังไม่มีรายการที่อ่านได้ — เพิ่มรายการเองได้ด้านล่าง"); return; }
    setItems((prev) => [
      ...prev,
      ...rows.map((r, i) => ({ ...r, key: `f${Date.now()}_${i}` })),
    ]);
    advance("items", `สร้าง ${rows.length} รายการจากไฟล์ ${src.length} ไฟล์`);
    toast.success(`สร้าง ${rows.length} รายการจากไฟล์ที่เลือกแล้ว`);
  }

  function patchItem(key: string, patch: Partial<CpoItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    advance("items");
  }

  function addItem() {
    setItems((prev) => [...prev, { key: `n${Date.now()}${prev.length}`, name: "", quantity: 1, unit: "แผ่น", price: 0, discount: 0 }]);
    advance("items");
  }

  function setDeliveryField(patch: Partial<DeliveryInfo>) {
    setDelivery((d) => {
      const next = { ...d, ...patch };
      if (selected) {
        void saveDelivery(selected, next).catch((e) => toast.error(e instanceof Error ? e.message : "บันทึกกำหนดส่งไม่สำเร็จ"));
        setOrders((p) => p.map((o) => (o.id === selected.id
          ? { ...o, dueDate: next.dueDate, receiveMethod: next.method, deliveryNote: next.note }
          : o)));
      }
      return next;
    });
    advance("totals");
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!selected) next.customer = "เลือกลูกค้าก่อน";
    if (!items.length) next.items = "ต้องมีอย่างน้อย 1 รายการ";
    items.forEach((it) => {
      if (!it.name.trim()) next[`name_${it.key}`] = "กรอกชื่อรายการ";
      if (!(it.quantity > 0)) next[`qty_${it.key}`] = "จำนวนต้องมากกว่า 0";
      if (!(it.price > 0)) next[`price_${it.key}`] = "กรอกราคา";
    });
    if (!delivery.dueDate) next.dueDate = "เลือกกำหนดส่ง";
    setInvalid(next);
    if (Object.keys(next).length) toast.error("ข้อมูลยังไม่ครบ — ตรวจช่องที่มีข้อความสีแดง");
    return !Object.keys(next).length;
  }

  /** ไฟล์ที่ติ๊กเลือกไว้ = ไฟล์แนบที่จะผูกกับออเดอร์ (ถ้าไม่ได้ติ๊กใช้ของเดิม) */
  const attachmentsToBind = (): DeskFile[] => {
    const chosen = files.filter((f) => picked[f.id]);
    return chosen.length ? chosen : (selected?.attachments ?? []);
  };

  const payload = () => ({
    items, subtotal: totals.subtotal, vat, net: totals.subtotal,
    note: delivery.note, vatEnabled: true, vatRate: 7,
    delivery, attachments: attachmentsToBind(),
  });

  async function onSaveDraft() {
    if (!selected) return;
    setBusy("draft");
    try {
      const attachments = attachmentsToBind();
      await saveDeskDraft(selected, payload());
      setOrders((p) => p.map((o) => (o.id === selected.id ? { ...o, items, note: delivery.note, attachments } : o)));
      await refreshSide(selected);
      toast.success(`บันทึกร่างแล้ว · ผูกไฟล์ ${attachments.length} ไฟล์`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  async function onCommit() {
    if (!selected || !validate()) return;
    setBusy("commit");
    try {
      const attachments = attachmentsToBind();
      await commitDeskOrder(selected, payload());
      setOrders((p) => p.map((o) => (o.id === selected.id
        ? { ...o, items, attachments, stage: "saved" as DeskStage, reviewStatus: "confirmed" } : o)));
      setStep(3);
      toast.success(`บันทึกคำสั่งซื้อ ${selected.poNumber} แล้ว — สร้างคำสั่งซื้อแล้ว`);
      // ออเดอร์ต้องไม่หายแม้แจ้งเตือนล้มเหลว — แค่บันทึกสถานะ failed ไว้
      const res = await notifyOrderLine(selected.id, "order_created");
      const failed = res.results.filter((r) => r.status === "failed").length;
      if (failed) toast.warning("บันทึกออเดอร์แล้ว แต่ส่งแจ้งเตือน LINE ไม่สำเร็จบางปลายทาง");
      await refreshSide(selected);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  async function onNotify(type: NotifyType, force = false) {
    if (!selected) return;
    if (selected.demo) { toast.info("ออเดอร์ตัวอย่างยังส่งแจ้งเตือนไม่ได้"); return; }
    setBusy("notify");
    try {
      const res = await notifyOrderLine(selected.id, type, { force });
      const ok = res.results.filter((r) => r.status === "sent").length;
      if (res.error || !res.ok) toast.error(res.error || "ส่งแจ้งเตือนไม่สำเร็จ");
      else if (ok) toast.success(`ส่งแจ้งเตือน “${NOTIFY_LABELS[type]}” แล้ว ${ok} ปลายทาง`);
      else toast.warning("ยังส่งไม่สำเร็จ — ดูสาเหตุในรายการแจ้งเตือน");
      await refreshSide(selected);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งแจ้งเตือนไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  function newIntake() {
    const id = `local-${Date.now()}`;
    const draft: DeskOrder = {
      id, poNumber: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      customerId: id, customerName: "ลูกค้าใหม่", org: "", phone: "", lineUserId: null, lineName: null,
      reviewStatus: "not_sent", createdAt: new Date().toISOString(), items: [], note: "",
      vatEnabled: true, vatRate: 7, dueDate: "", receiveMethod: RECEIVE_METHODS[0], deliveryNote: "",
      stage: "files", attachments: [], demo: true,
    };
    setOrders((p) => [draft, ...p]);
    setTab("new");
    setSelectedId(id);
    toast.success("เปิดแบบฟอร์มรับคำสั่งซื้อใหม่แล้ว");
  }

  /* ------------------------------------------------------------------- view */

  const th = "px-3 py-2 text-left text-[14px] font-medium text-[#5C6B82]";
  const cell = "px-3 py-2 text-[15px] text-[#17263D]";
  const input = "w-full rounded-[6px] border border-[#DDE2EA] bg-white px-2.5 py-1.5 text-[15px] text-[#17263D] outline-none focus:border-[#5B258B]";

  return (
    <div className="flex h-screen w-full flex-col bg-white text-[#17263D]">
      {/* 1. แถบด้านบน */}
      <header className="flex h-[80px] shrink-0 items-center gap-6 border-b border-[#DDE2EA] bg-white px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-[22px] font-bold">นัฐภรณ์ เชียงกลาง</h1>
          <span className="h-7 w-px bg-[#DDE2EA]" />
          <span className="text-[20px] font-semibold text-[#5B258B]">จัดการคำสั่งซื้อ</span>
        </div>
        <div className="relative mx-auto w-full max-w-[520px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A96A8]" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาลูกค้า โรงเรียน หรือเลขออเดอร์"
            aria-label="ค้นหาลูกค้า โรงเรียน หรือเลขออเดอร์"
            className="h-[46px] w-full rounded-[8px] border border-[#DDE2EA] bg-white pl-11 pr-4 text-[16px] outline-none focus:border-[#5B258B]"
          />
        </div>
        <button
          type="button" onClick={newIntake}
          className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-[8px] px-5 text-[16px] font-semibold text-white"
          style={{ background: PURPLE }}
        >
          <Plus className="h-5 w-5" /> รับคำสั่งซื้อใหม่
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 2. คอลัมน์ซ้าย */}
        <aside className="flex w-[30%] min-w-[320px] max-w-[460px] shrink-0 flex-col border-r border-[#DDE2EA] bg-white">
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-[18px] font-bold">คำสั่งซื้อจากลูกค้า</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {DESK_TABS.map((t) => {
                const active = t.key === tab;
                return (
                  <button
                    key={t.key} type="button" onClick={() => setTab(t.key)}
                    className="inline-flex items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[15px]"
                    style={active
                      ? { background: PURPLE, borderColor: PURPLE, color: "#fff" }
                      : { background: "#fff", borderColor: "#DDE2EA", color: "#17263D" }}
                  >
                    {t.label}
                    {counts[t.key] > 0 && <span className={active ? "font-semibold" : "font-semibold text-[#5B258B]"}>{counts[t.key]}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_64px_92px_78px] border-y border-[#DDE2EA] bg-white px-5 py-2 text-[14px] text-[#5C6B82]">
            <span>ลูกค้า / เลขออเดอร์</span><span>ไฟล์</span><span>วันที่ / เวลา</span><span>สถานะ</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && <div className="flex items-center gap-2 p-5 text-[15px] text-[#5C6B82]"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…</div>}
            {!loading && error && (
              <div className="m-4 flex items-start gap-2 rounded-[6px] border border-[#F0C0BC] bg-[#FDECEC] p-3 text-[15px] text-[#C2352F]">
                <AlertTriangle className="mt-0.5 h-4 w-4" /> {error}
              </div>
            )}
            {!loading && !error && !visible.length && (
              <p className="p-5 text-[15px] text-[#5C6B82]">ยังไม่มีคำสั่งซื้อในสถานะนี้</p>
            )}
            {visible.map((o) => {
              const active = o.id === selectedId;
              const t = tabOfOrder(o);
              const tone = DESK_TAB_TONE[t];
              return (
                <button
                  key={o.id} type="button" onClick={() => setSelectedId(o.id)}
                  className="grid w-full grid-cols-[1fr_64px_92px_78px] items-center gap-1 border-b border-[#EDF0F5] px-5 py-4 text-left"
                  style={active ? { background: "#F6F0FA", boxShadow: `inset 4px 0 0 ${PURPLE}` } : undefined}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-semibold">{o.customerName}</span>
                    <span className="block truncate text-[15px] text-[#5C6B82]">{shortCustomerId(o)}</span>
                  </span>
                  <span className="text-[15px] text-[#17263D]">{o.demo ? `${(o.items.length || 0) + 15} ไฟล์` : "—"}</span>
                  <span className="text-[15px] text-[#5C6B82]">{fmtWhen(o.createdAt)}</span>
                  <span
                    className="justify-self-start rounded-[6px] border px-2 py-1 text-[14px]"
                    style={{ color: tone.text, background: tone.bg, borderColor: tone.border }}
                  >
                    {DESK_TABS.find((x) => x.key === t)?.label}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* กลาง + ขวา */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* 3. ข้อมูลลูกค้า */}
          <div className="flex h-[80px] shrink-0 items-center gap-5 border-b border-[#DDE2EA] px-6">
            {selected ? (
              <>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: "#F1EAF8" }}>
                  <School className="h-6 w-6" style={{ color: PURPLE }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[19px] font-bold">{selected.customerName}</span>
                  <span className="block text-[15px] text-[#5C6B82]">{shortCustomerId(selected)}</span>
                </span>
                {selected.lineUserId && (
                  <span className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-[6px]" style={{ background: "#06C755" }}>
                      <MessageCircle className="h-4 w-4 text-white" />
                    </span>
                    <span className="text-[15px]">
                      <span className="block font-medium" style={{ color: "#06C755" }}>LINE เชื่อมต่อแล้ว</span>
                      <span className="block text-[#5C6B82]">{selected.lineName}</span>
                    </span>
                  </span>
                )}
                <span className="flex items-center gap-2 text-[16px]">
                  <Phone className="h-5 w-5 text-[#5C6B82]" /> {selected.phone || "-"}
                </span>
                <span className="h-7 w-px bg-[#DDE2EA]" />
                <button type="button" className="inline-flex items-center gap-2 text-[16px]" style={{ color: PURPLE }}
                  onClick={() => toast.info("แก้ไขข้อมูลลูกค้าได้ที่หน้าลูกค้า & LINE OA")}>
                  <Pencil className="h-4 w-4" /> แก้ไขข้อมูลลูกค้า
                </button>
              </>
            ) : (
              <p className="text-[16px] text-[#5C6B82]">เลือกคำสั่งซื้อจากรายการด้านซ้าย</p>
            )}
          </div>

          <div className="flex min-h-0 flex-1">
            {/* 4-6 พื้นที่ทำงาน */}
            <div className="flex min-w-0 flex-1 gap-6 overflow-y-auto p-6">
              {/* stepper */}
              <ol className="w-[110px] shrink-0">
                {STEPS.map((s, i) => (
                  <li key={s} className="relative pb-12 last:pb-0">
                    {i < STEPS.length - 1 && <span className="absolute left-[17px] top-9 h-12 w-px bg-[#DDE2EA]" />}
                    <span className="flex items-center gap-2">
                      <span
                        className="grid h-9 w-9 place-items-center rounded-full border text-[16px] font-semibold"
                        style={i === step
                          ? { background: PURPLE, borderColor: PURPLE, color: "#fff" }
                          : { background: "#fff", borderColor: "#DDE2EA", color: "#5C6B82" }}
                      >{i + 1}</span>
                      <span className="text-[15px]" style={{ color: i === step ? PURPLE : "#5C6B82", fontWeight: i === step ? 600 : 400 }}>{s}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <div className="min-w-0 flex-1 space-y-6">
                {/* 5. ไฟล์ */}
                <div className="rounded-[8px] border border-[#DDE2EA]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[#DDE2EA] px-4 py-3">
                    <h3 className="text-[17px] font-bold">ไฟล์ที่ลูกค้าส่งมา {files.length} ไฟล์</h3>
                    <span className="ml-auto text-[15px] text-[#5C6B82]">เลือกแล้ว {pickedIds.length} ไฟล์</span>
                    <button type="button" onClick={pickAll}
                      className="rounded-[6px] border px-3 py-1.5 text-[15px]" style={{ borderColor: PURPLE, color: PURPLE }}>
                      เลือกทั้งหมด
                    </button>
                    <button type="button" onClick={buildFromFiles} disabled={!pickedIds.length}
                      className="rounded-[6px] px-3 py-1.5 text-[15px] font-medium text-white disabled:opacity-40"
                      style={{ background: PURPLE }}>
                      สร้างรายการจากไฟล์ที่เลือก
                    </button>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-[#DDE2EA]">
                          <th className={th + " w-[44px]"}><span className="sr-only">เลือก</span></th>
                          <th className={th + " w-[80px]"}>ประเภท</th>
                          <th className={th}>ชื่อไฟล์</th>
                          <th className={th + " w-[140px]"}>ขนาด / หน้า</th>
                          <th className={th + " w-[110px]"}>ตัวอย่าง</th>
                          <th className={th + " w-[90px]"}>จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filesLoading && <tr><td className={cell} colSpan={6}><Loader2 className="inline h-4 w-4 animate-spin" /> กำลังโหลดไฟล์…</td></tr>}
                        {!filesLoading && !files.length && <tr><td className={cell + " text-[#5C6B82]"} colSpan={6}>ยังไม่มีไฟล์จากลูกค้ารายนี้</td></tr>}
                        {files.map((f, i) => (
                          <tr key={f.id} className="border-b border-[#EDF0F5] last:border-0">
                            <td className={cell}>
                              <input type="checkbox" className="h-[18px] w-[18px] accent-[#5B258B]"
                                checked={!!picked[f.id]} onChange={() => togglePick(f.id)} aria-label={`เลือก ${f.name}`} />
                            </td>
                            <td className={cell}><FileIcon kind={f.kind} /></td>
                            <td className={cell + " truncate"}>{f.name}</td>
                            <td className={cell + " text-[#5C6B82]"}>{fmtSize(f.sizeBytes)}{f.pages ? ` / ${f.pages} หน้า` : ""}</td>
                            <td className={cell}>
                              <span className="grid h-[42px] w-[68px] place-items-center overflow-hidden rounded-[4px] border border-[#DDE2EA] bg-[#F7F8FA]">
                                {f.url && f.kind === "image"
                                  ? <img src={f.url} alt="" className="h-full w-full object-cover" />
                                  : <FileIcon kind={f.kind} />}
                              </span>
                            </td>
                            <td className={cell}>
                              <button type="button" onClick={() => setPreviewIdx(i)} style={{ color: PURPLE }} className="text-[15px]">ดูไฟล์</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 6. รายการคำสั่งซื้อ */}
                <div className="rounded-[8px] border border-[#DDE2EA]">
                  <div className="border-b border-[#DDE2EA] px-4 py-3">
                    <h3 className="text-[17px] font-bold">รายการคำสั่งซื้อ</h3>
                    {invalid.items && <p className="mt-1 text-[15px] text-[#C2352F]">{invalid.items}</p>}
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#DDE2EA]">
                        <th className={th + " w-[46px]"}>#</th>
                        <th className={th}>รายการ</th>
                        <th className={th + " w-[120px]"}>จำนวน</th>
                        <th className={th + " w-[130px]"}>หน่วย</th>
                        <th className={th + " w-[150px]"}>ราคา/หน่วย (บาท)</th>
                        <th className={th + " w-[130px]"}>รวม (บาท)</th>
                        <th className={th + " w-[56px]"}><span className="sr-only">ลบ</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!items.length && <tr><td className={cell + " text-[#5C6B82]"} colSpan={7}>ยังไม่มีรายการ — เลือกไฟล์แล้วกด “สร้างรายการจากไฟล์ที่เลือก” หรือกด “เพิ่มรายการ”</td></tr>}
                      {items.map((it, i) => (
                        <tr key={it.key} className="border-b border-[#EDF0F5] align-top last:border-0">
                          <td className={cell + " pt-4 text-[#5C6B82]"}>{i + 1}</td>
                          <td className={cell}>
                            <input className={input} value={it.name} placeholder="ชื่อรายการ"
                              aria-label={`ชื่อรายการที่ ${i + 1}`}
                              onChange={(e) => patchItem(it.key, { name: e.target.value })} />
                            {invalid[`name_${it.key}`] && <span className="text-[14px] text-[#C2352F]">{invalid[`name_${it.key}`]}</span>}
                          </td>
                          <td className={cell}>
                            <input type="number" min={0} className={input} value={it.quantity}
                              aria-label={`จำนวนรายการที่ ${i + 1}`}
                              onChange={(e) => patchItem(it.key, { quantity: Number(e.target.value) || 0 })} />
                            {invalid[`qty_${it.key}`] && <span className="text-[14px] text-[#C2352F]">{invalid[`qty_${it.key}`]}</span>}
                          </td>
                          <td className={cell}>
                            <select className={input} value={it.unit} aria-label={`หน่วยรายการที่ ${i + 1}`}
                              onChange={(e) => patchItem(it.key, { unit: e.target.value })}>
                              {[...new Set([it.unit, ...UNIT_OPTIONS])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className={cell}>
                            <input type="number" min={0} step="0.01" className={input + " text-right"} value={it.price}
                              aria-label={`ราคาต่อหน่วยรายการที่ ${i + 1}`}
                              onChange={(e) => patchItem(it.key, { price: Number(e.target.value) || 0 })} />
                            {invalid[`price_${it.key}`] && <span className="text-[14px] text-[#C2352F]">{invalid[`price_${it.key}`]}</span>}
                          </td>
                          <td className={cell + " pt-4 text-right font-medium"}>{fmtMoney(itemTotal(it))}</td>
                          <td className={cell + " pt-4"}>
                            <button type="button" aria-label={`ลบรายการที่ ${i + 1}`}
                              onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}>
                              <Trash2 className="h-5 w-5 text-[#8A96A8] hover:text-[#C2352F]" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3">
                    <button type="button" onClick={addItem} className="inline-flex items-center gap-2 text-[16px]" style={{ color: PURPLE }}>
                      <Plus className="h-5 w-5" /> เพิ่มรายการ
                    </button>
                  </div>
                </div>

                {/* ประวัติการแก้ไขแต่ละจุด */}
                <div className="rounded-[8px] border border-[#DDE2EA]">
                  <div className="flex items-center gap-2 border-b border-[#DDE2EA] px-4 py-3">
                    <History className="h-5 w-5" style={{ color: PURPLE }} />
                    <h3 className="text-[17px] font-bold">ประวัติการทำงานของออเดอร์นี้</h3>
                    <span className="ml-auto text-[15px] text-[#5C6B82]">{events.length} รายการ</span>
                  </div>
                  <ul className="max-h-[260px] overflow-y-auto">
                    {!events.length && <li className="px-4 py-3 text-[15px] text-[#5C6B82]">ยังไม่มีประวัติสำหรับออเดอร์นี้</li>}
                    {events.map((ev) => (
                      <li key={ev.id} className="flex items-start gap-3 border-b border-[#EDF0F5] px-4 py-3 last:border-0">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: PURPLE }} />
                        <span className="min-w-0">
                          <span className="block text-[15px] text-[#17263D]">{ev.note || ev.event}</span>
                          <span className="block text-[14px] text-[#5C6B82]">{fmtWhen(ev.createdAt)} · {ev.actor}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* 7. คอลัมน์สรุปด้านขวา */}
            <aside className="w-[17%] min-w-[248px] shrink-0 overflow-y-auto border-l border-[#DDE2EA] bg-[#FDFBF7] p-5">
              <label className="block text-[15px] font-medium">กำหนดส่ง</label>
              <div className="relative mt-2">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5C6B82]" />
                <input type="date" value={delivery.dueDate} aria-label="กำหนดส่ง"
                  onChange={(e) => setDeliveryField({ dueDate: e.target.value })}
                  className="h-[42px] w-full rounded-[6px] border border-[#DDE2EA] bg-white pl-9 pr-2 text-[15px] outline-none focus:border-[#5B258B]" />
              </div>
              {invalid.dueDate && <p className="mt-1 text-[14px] text-[#C2352F]">{invalid.dueDate}</p>}

              <label className="mt-5 block text-[15px] font-medium">วิธีรับงาน</label>
              <select value={delivery.method} aria-label="วิธีรับงาน"
                onChange={(e) => setDeliveryField({ method: e.target.value })}
                className="mt-2 h-[42px] w-full rounded-[6px] border border-[#DDE2EA] bg-white px-2.5 text-[15px] outline-none focus:border-[#5B258B]">
                {RECEIVE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>

              <label className="mt-5 block text-[15px] font-medium">หมายเหตุ</label>
              <textarea value={delivery.note} maxLength={200} rows={5} placeholder="พิมพ์หมายเหตุ (ถ้ามี)"
                aria-label="หมายเหตุ"
                onChange={(e) => setDeliveryField({ note: e.target.value.slice(0, 200) })}
                className="mt-2 w-full rounded-[6px] border border-[#DDE2EA] bg-white p-2.5 text-[15px] outline-none focus:border-[#5B258B]" />
              <p className="mt-1 text-right text-[14px] text-[#5C6B82]">{delivery.note.length} / 200</p>

              <div className="mt-6 space-y-2 border-t border-[#DDE2EA] pt-4 text-[15px]">
                <div className="flex justify-between"><span className="text-[#5C6B82]">ยอดรวมก่อนภาษี</span><span>{fmtMoney(preVat)} บาท</span></div>
                <div className="flex justify-between"><span className="text-[#5C6B82]">ภาษีมูลค่าเพิ่ม 7%</span><span>{fmtMoney(vat)} บาท</span></div>
              </div>

              <div className="mt-4 rounded-[8px] border p-4 text-center" style={{ background: "#F6F0FA", borderColor: "#E0D0EE" }}>
                <p className="text-[15px] text-[#5C6B82]">รวมทั้งสิ้น</p>
                <p className="text-[26px] font-bold" style={{ color: PURPLE }}>
                  {fmtMoney(totals.subtotal)} <span className="text-[16px] font-medium">บาท</span>
                </p>
              </div>

              <button type="button" onClick={onCommit} disabled={!selected || busy !== ""}
                className="mt-5 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-[8px] text-[16px] font-semibold text-white disabled:opacity-50"
                style={{ background: PURPLE }}>
                {busy === "commit" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} บันทึกคำสั่งซื้อ
              </button>
              <button type="button" onClick={onSaveDraft} disabled={!selected || busy !== ""}
                className="mt-3 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-[8px] border bg-white text-[16px] font-semibold disabled:opacity-50"
                style={{ borderColor: PURPLE, color: PURPLE }}>
                {busy === "draft" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} บันทึกร่าง
              </button>

              {/* แจ้งเตือน LINE */}
              <div className="mt-6 border-t border-[#DDE2EA] pt-4">
                <h3 className="text-[16px] font-bold">แจ้งเตือนลูกค้าผ่าน LINE</h3>

                {/* ปลายทางที่ระบบใช้ส่งจริง */}
                <div className="mt-2 rounded-[6px] border border-[#DDE2EA] bg-[#F7F5FB] p-3 text-[14px]" data-testid="line-target-info">
                  <p className="font-semibold text-[#17263D]">แจ้งเตือนกลุ่มร้าน: ปิดใช้งานอยู่</p>
                  <p className="mt-1 text-[#5C6B82]">แอดมินดูออเดอร์จากแชทลูกค้าใน LINE OA โดยตรง ระบบจึงส่งเฉพาะฝั่งลูกค้า</p>
                  <p className="mt-1 text-[13px] text-[#5C6B82]">
                    ปลายทางลูกค้า: {selected?.lineUserId ? maskLineId(selected.lineUserId) : "ยังไม่ได้เชื่อม LINE"}
                  </p>
                </div>

                {selected && !selected.lineUserId && (
                  <p className="mt-2 text-[14px] text-[#B26A00]">ลูกค้ารายนี้ยังไม่ได้เชื่อม LINE — ระบบจะยังไม่ส่งแจ้งเตือน</p>
                )}

                <div className="mt-3 grid gap-2">
                  {STATUS_ACTIONS.map((t) => (
                    <button key={t} type="button" onClick={() => onNotify(t)} disabled={!selected || busy !== ""}
                      className="inline-flex h-[38px] items-center justify-center gap-2 rounded-[6px] border bg-white text-[15px] disabled:opacity-50"
                      style={{ borderColor: "#DDE2EA", color: "#17263D" }}>
                      <Send className="h-4 w-4" style={{ color: PURPLE }} /> {NOTIFY_LABELS[t]}
                    </button>
                  ))}
                </div>

                {!!failedLogs.length && (
                  <div className="mt-4 rounded-[6px] border border-[#F0C0BC] bg-[#FDECEC] p-3">
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-[#C2352F]">
                      <AlertTriangle className="h-4 w-4" /> ส่งแจ้งเตือนไม่สำเร็จ {failedLogs.length} รายการ
                    </p>
                    {failedLogs.map((l) => (
                      <div key={l.id} className="mt-2 text-[14px] text-[#7A2B27]">
                        <p>{NOTIFY_LABELS[l.notificationType as NotifyType] ?? l.notificationType} · {l.recipientType === "customer" ? "ลูกค้า" : "กลุ่มร้าน"}</p>
                        <p className="text-[13px]">{l.errorMessage || "ไม่ทราบสาเหตุ"}</p>
                        <button type="button" disabled={busy !== ""}
                          onClick={() => onNotify(l.notificationType as NotifyType, true)}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-[6px] border border-[#C2352F] bg-white px-2.5 py-1 text-[14px] text-[#C2352F] disabled:opacity-50">
                          <RefreshCw className="h-3.5 w-3.5" /> ส่งแจ้งเตือนอีกครั้ง
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ตารางสถานะการส่งต่อปลายทาง */}
                <div className="mt-4">
                  <p className="text-[15px] font-semibold text-[#17263D]">สถานะการส่งต่อปลายทาง</p>
                  {!logs.length ? (
                    <p className="mt-1 text-[14px] text-[#5C6B82]">ยังไม่มีประวัติการส่งของออเดอร์นี้</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto rounded-[6px] border border-[#DDE2EA]">
                      <table className="w-full border-collapse text-[13px]" data-testid="line-delivery-table">
                        <thead>
                          <tr className="bg-[#F4F6F9] text-left text-[#5C6B82]">
                            <th className="px-2 py-1.5 font-semibold">ปลายทาง</th>
                            <th className="px-2 py-1.5 font-semibold">ข้อความ</th>
                            <th className="px-2 py-1.5 font-semibold">สถานะ</th>
                            <th className="px-2 py-1.5 font-semibold">เวลาส่ง</th>
                            <th className="px-2 py-1.5" />
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((l) => (
                            <tr key={`row-${l.id}`} className="border-t border-[#EDF0F4] align-top">
                              <td className="px-2 py-1.5">
                                <span className="block text-[#17263D]">{RECIPIENT_LABEL[l.recipientType] ?? l.recipientType}</span>
                                <span className="block font-mono text-[12px] text-[#5C6B82]">{maskLineId(l.targetId)}</span>
                              </td>
                              <td className="px-2 py-1.5 text-[#17263D]">
                                {NOTIFY_LABELS[l.notificationType as NotifyType] ?? l.notificationType}
                              </td>
                              <td className="px-2 py-1.5">
                                {isDisabledRecipient(l.recipientType) ? (
                                  <span className="text-[#5C6B82]">ปิดใช้งานอยู่</span>
                                ) : (
                                  <>
                                    <span style={{ color: l.status === "sent" ? "#1B7F4B" : l.status === "failed" ? "#C2352F" : "#5C6B82" }}>
                                      {NOTIFY_STATUS_LABEL[l.status] ?? l.status}
                                    </span>
                                    {l.errorMessage && (
                                      <span className="mt-0.5 block break-words text-[12px] text-[#C2352F]">{l.errorMessage}</span>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-[#5C6B82]">
                                {l.sentAt ? fmtWhen(l.sentAt) : "-"}
                                <span className="mt-0.5 block text-[12px]">สร้าง {l.createdAt ? fmtWhen(l.createdAt) : "-"}</span>
                              </td>
                              <td className="px-2 py-1.5">
                                {l.status !== "sent" && !isDisabledRecipient(l.recipientType) && (
                                  <button type="button" disabled={busy !== ""}
                                    onClick={() => onNotify(l.notificationType as NotifyType, true)}
                                    className="inline-flex items-center gap-1 rounded-[6px] border border-[#DDE2EA] bg-white px-2 py-1 text-[12px] disabled:opacity-50"
                                    style={{ color: PURPLE }}>
                                    <RefreshCw className="h-3 w-3" /> ส่งซ้ำ
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </aside>
          </div>
        </section>
      </div>

      {previewIdx !== null && (
        <FilePreviewDialog files={files} index={previewIdx} onIndex={setPreviewIdx} onClose={() => setPreviewIdx(null)} />
      )}
    </div>
  );
}
