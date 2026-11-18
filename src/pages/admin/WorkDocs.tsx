import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, FolderOpen, Link2, Loader2, MessageCircle, Plus, Search,
  Send, Trash2, Upload,
} from "lucide-react";
import DashboardShell from "@/components/layout/DashboardShell";
import AdminBottomNav from "@/components/admin/AdminBottomNav";
import CustomerAvatar from "@/components/admin/work-docs/CustomerAvatar";
import useLineProfileMap from "@/hooks/useLineProfileMap";
import { useFreshBuildOnMount } from "@/lib/freshBuild";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NewWorkDialog, { type NewWorkPrefill } from "@/components/admin/work-docs/NewWorkDialog";
import ChatOrderHints from "@/components/admin/work-docs/ChatOrderHints";
import NotificationsPanel from "@/components/admin/work-docs/NotificationsPanel";
import PriceEditor from "@/components/admin/work-docs/PriceEditor";
import { downloadCsv } from "@/lib/csv";
import { StatusChips } from "@/components/admin/hub/ui";
import { ORDER_FLOW, orderStatusLabel } from "@/components/admin/hub/orderStatus";
import {
  acknowledgeItem, deleteWorkItem, fmtSize, fmtWhen, isAcknowledged, isOrderKind, isSent, KIND_LABEL, listWorkItems,
  listChatOrderHints, loadWorkFiles, markChatOrderHint, matchesFilter, matchesSearch, needsAction,
  resendAck, sendDeliveryNote, statusLabel,
  markOrderNotificationsRead, setWorkStatus, uploadDeliveryNote, workItemsToCsvRows, workStatusKey,
  type ChatOrderHint, type WorkFile, type WorkFilter, type WorkItem, type WorkTab,
} from "@/lib/workDocs";

/** โหลดเฉพาะตอนเปิดแชทจริง เพื่อไม่ให้หน้าเว็บยิงคิวรีศูนย์รวมลูกค้าตอนเข้าหน้า */
const CustomerChatDialog = lazy(() => import("@/components/admin/work-docs/CustomerChatDialog"));
/** “จับคู่ลูกค้ากับ LINE ด้วยมือ” — ย้ายมาจากหน้า /admin/customer-hub (โหลดเมื่อกดเปิดเท่านั้น) */
const LineMatchDialog = lazy(() => import("@/components/admin/work-docs/LineMatchDialog"));
/** ประวัติการส่งข้อความของงานนี้ (อ่านอย่างเดียว) — ย้ายมาจากหน้า /admin/order-alerts เดิม */
const OrderDeliveryTimeline = lazy(() => import("@/components/admin/OrderDeliveryTimeline"));

const FILTERS: { key: WorkFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "order", label: "คำสั่งซื้อ" },
  { key: "requisition", label: "ใบเขียนเบิก" },
];


const TABS: { key: WorkTab; label: string }[] = [
  { key: "pending", label: "รอดำเนินการ" },
  { key: "sent", label: "ส่งกลับแล้ว" },
];

const key = (i: WorkItem) => `${i.kind}-${i.id}`;

/**
 * “งานและเอกสาร” — flow เดียว: ลูกค้าส่งรายการ → ยืนยันรับ → แนบใบส่งของ → ส่งกลับทาง LINE
 * รวมคำสั่งซื้อและใบเขียนเบิกไว้ในหน้าเดียว (ใช้ตาราง/ไฟล์เดิมทั้งหมด)
 */
export default function AdminWorkDocs() {
  useFreshBuildOnMount();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") === "sent" ? "sent" : "pending") as WorkTab;
  const rawFilter = params.get("filter");
  const filter = (rawFilter === "order" || rawFilter === "requisition" ? rawFilter : "all") as WorkFilter;
  const todoOnly = params.get("todo") === "1";
  const selectedId = params.get("id") || "";
  const selectedKind = params.get("kind") as WorkItem["kind"] | null;


  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<WorkFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [busy, setBusy] = useState<"" | "ack" | "upload" | "send" | "status" | "delete">("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const [chatOpen, setChatOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(params.get("match") === "1");
  const [hints, setHints] = useState<ChatOrderHint[]>([]);
  const [prefill, setPrefill] = useState<NewWorkPrefill | null>(null);

  const reload = useCallback(async () => {
    try {
      setError("");
      const rows = await listWorkItems();
      setItems(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  /** คำแนะนำจากข้อความ LINE — โหลดแยกจากลิสต์งาน ถ้าพลาดก็ไม่ทำให้หน้าเสีย */
  const reloadHints = useCallback(async () => {
    try { setHints(await listChatOrderHints()); } catch { setHints([]); }
  }, []);

  useEffect(() => { void reload(); void reloadHints(); }, [reload, reloadHints]);

  const onHintCreate = useCallback(async (h: ChatOrderHint) => {
    const { chatLinesToItems } = await import("@/lib/chatOrderDetect");
    setPrefill({
      customerName: h.customerName,
      lineUserId: h.lineUserId,
      items: chatLinesToItems(h.items),
      note: `รายการจากข้อความ LINE (${fmtWhen(h.createdAt)})`,
    });
    setNewOpen(true);
  }, []);

  const onHintDismiss = useCallback(async (h: ChatOrderHint) => {
    setHints((prev) => prev.filter((x) => x.messageId !== h.messageId));
    try {
      await markChatOrderHint(h, "dismissed");
    } catch {
      toast.error("บันทึกการข้ามไม่สำเร็จ — จะแสดงอีกครั้งเมื่อรีเฟรช");
    }
  }, []);


  const profiles = useLineProfileMap(items.map((i) => i.lineUserId));

  const visible = useMemo(() => items.filter((i) => {

    if (!matchesFilter(i, filter)) return false;
    if (todoOnly) return needsAction(i) && matchesSearch(i, q);
    if (tab === "sent" ? !isSent(i) : isSent(i)) return false;
    return matchesSearch(i, q);
  }), [items, filter, tab, todoOnly, q]);

  const selected = useMemo(
    () => visible.find((i) => i.id === selectedId && (!selectedKind || i.kind === selectedKind))
      ?? items.find((i) => i.id === selectedId && (!selectedKind || i.kind === selectedKind))
      ?? null,
    [visible, items, selectedId, selectedKind],
  );

  useEffect(() => {
    if (!selected) { setFiles([]); return; }
    let alive = true;
    setFilesLoading(true);
    loadWorkFiles(selected)
      .then((f) => { if (alive) setFiles(f); })
      .catch(() => { if (alive) setFiles([]); })
      .finally(() => { if (alive) setFilesLoading(false); });
    return () => { alive = false; };
  }, [selected]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: false });
  };

  /* --------------------------------------------------------------- actions */

  const onAck = async () => {
    if (!selected || busy) return;
    setBusy("ack");
    try {
      const res = await acknowledgeItem(selected);
      // กระดิ่งแจ้งเตือน "คำสั่งซื้อใหม่" ต้องลดลงตามจริงเมื่อรับเรื่องแล้ว (best-effort)
      void markOrderNotificationsRead(selected.id).catch(() => undefined);
      await reload();
      if (res.ok) toast.success("บันทึกรับเรื่องและส่งข้อความให้ลูกค้าแล้ว");
      else if (res.error === "no_line_link") toast.warning("บันทึกรับเรื่องแล้ว แต่ยังไม่ได้ส่ง LINE — รอจับคู่ลูกค้า");
      else toast.error("บันทึกรับเรื่องแล้ว แต่ส่ง LINE ไม่สำเร็จ — ลองส่งใหม่ได้");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const onResendAck = async () => {
    if (!selected || busy) return;
    setBusy("ack");
    try {
      const res = await resendAck(selected);
      toast[res.ok ? "success" : "error"](res.ok ? "ส่งข้อความอีกครั้งสำเร็จ" : "ส่งไม่สำเร็จ — ลองใหม่อีกครั้ง");
    } finally {
      setBusy("");
    }
  };

  const onPick = async (f: File | undefined) => {
    if (!selected || !f || busy) return;
    setBusy("upload");
    try {
      await uploadDeliveryNote(selected, f);
      await reload();
      toast.success("แนบไฟล์ใบส่งของแล้ว (บันทึกไว้ก่อน ยังไม่ส่ง)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const onSend = async () => {
    if (!selected || busy) return;
    setBusy("send");
    try {
      const res = await sendDeliveryNote(selected, isSent(selected));
      await reload();
      if (res.ok) {
        toast.success("ส่งไฟล์ใบส่งของให้ลูกค้าทาง LINE แล้ว");
        setParam({ tab: "sent", todo: null });
      } else if (res.error === "no_line_link") {
        toast.warning("ยังไม่ได้ส่ง LINE — รอจับคู่ลูกค้า");
      } else {
        toast.error("ส่งไม่สำเร็จ — รายการยังอยู่ ลองส่งใหม่ได้");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const onSetStatus = async (next: string) => {
    if (!selected || busy) return;
    setBusy("status");
    try {
      await setWorkStatus(selected, next);
      await reload();
      toast.success(`อัปเดตสถานะเป็น “${orderStatusLabel(next)}” แล้ว`);
    } catch (e) {
      toast.error(`เปลี่ยนสถานะไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  const onDelete = async () => {
    if (!selected || busy) return;
    const label = `${KIND_LABEL[selected.kind]} ${selected.code} · ${selected.customerName}`;
    if (!window.confirm(`ลบ ${label} ออกจากระบบหรือไม่? การลบนี้ย้อนกลับไม่ได้`)) return;
    setBusy("delete");
    try {
      await deleteWorkItem(selected);
      setParam({ id: null });
      await reload();
      toast.success("ลบรายการแล้ว");
    } catch (e) {
      toast.error(`ลบไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy("");
    }
  };

  /** ส่งออกเฉพาะรายการที่กรองอยู่บนหน้าจอ */
  const onExportCsv = () => {
    if (visible.length === 0) { toast.warning("ไม่มีรายการให้ส่งออก"); return; }
    downloadCsv(`work-docs-${new Date().toISOString().slice(0, 10)}.csv`, workItemsToCsvRows(visible));
    toast.success(`ส่งออก ${visible.length} รายการแล้ว`);
  };

  /* ------------------------------------------------------------------- ui */

  const listPane = (
    <div className="portal-card flex min-h-0 flex-col overflow-hidden p-0">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า หรือเลขที่รายการ"
            className="h-11 pl-9 text-[15px]"
            aria-label="ค้นหาชื่อลูกค้า หรือเลขที่รายการ"
          />
        </div>
        <div className="mt-3 flex gap-2" role="tablist" aria-label="ตัวกรองประเภทงาน">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setParam({ filter: f.key === "all" ? null : f.key, id: null })}
              className={`min-h-9 flex-1 rounded-xl px-3 text-[13px] font-semibold transition-colors ${
                filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm" style={{ color: "hsl(var(--ng-muted))" }}>กำลังโหลด…</div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">โหลดข้อมูลไม่สำเร็จ: {error}</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: "hsl(var(--ng-muted))" }}>ไม่มีรายการในกลุ่มนี้</div>
        ) : visible.map((i) => (
          <button
            key={key(i)}
            data-testid="work-list-row"
             onClick={() => setParam({ id: i.id, kind: i.kind })}
             className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-0 hover:bg-accent/40 ${
               selected?.id === i.id && selected?.kind === i.kind ? "bg-accent/60" : ""
            }`}
          >
            <CustomerAvatar name={i.customerName} pictureUrl={profiles[i.lineUserId || ""]?.pictureUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{i.customerName}</span>
                <span
                  className="shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    background: isOrderKind(i.kind) ? "hsl(var(--ng-purple-tint))" : "hsl(var(--ng-blue-tint))",
                    color: isOrderKind(i.kind) ? "hsl(var(--ng-purple-deep))" : "hsl(var(--ng-blue))",
                  }}
                >
                  {KIND_LABEL[i.kind]}
                </span>
              </span>
              <span className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs" style={{ color: "hsl(var(--ng-muted))" }}>
                <span className="min-w-0 truncate">{i.code} · {fmtWhen(i.createdAt)}</span>
                <span
                  className="shrink-0 font-semibold"
                  style={{ color: isAcknowledged(i) ? "hsl(var(--ng-green-deep))" : "hsl(var(--ng-orange-deep))" }}
                >
                  {statusLabel(i)}
                </span>
              </span>
            </span>

          </button>

        ))}
      </div>
    </div>
  );

  const detailPane = !selected ? (
    <div className="portal-card grid min-h-[240px] place-items-center text-center text-sm text-muted-foreground">
      เลือกรายการทางซ้ายเพื่อดูรายละเอียดและดำเนินการ
    </div>
  ) : (
    <div className="flex flex-col gap-3" data-testid="work-detail">
      <div className="portal-card">
        <button
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold xl:hidden"
          onClick={() => setParam({ id: null })}
        >
          <ArrowLeft className="h-4 w-4" /> กลับไปรายการ
        </button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <CustomerAvatar name={selected.customerName} pictureUrl={profiles[selected.lineUserId || ""]?.pictureUrl} size={56} />
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-extrabold" style={{ color: "hsl(var(--ng-ink))" }}>
                {selected.customerName}
              </h2>
              <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>
                {KIND_LABEL[selected.kind]} · {selected.code} · {fmtWhen(selected.createdAt)}
              </p>
            </div>
          </div>

          <span
            className="rounded-xl px-3 py-1 text-[13px] font-bold"
            style={{
              background: isSent(selected) ? "hsl(var(--ng-green-tint))" : isAcknowledged(selected) ? "hsl(var(--ng-purple-tint))" : "hsl(var(--ng-orange-tint))",
              color: isSent(selected) ? "hsl(var(--ng-green-deep))" : isAcknowledged(selected) ? "hsl(var(--ng-purple-deep))" : "hsl(var(--ng-orange-deep))",
            }}
          >
            {isSent(selected) ? "ส่งกลับแล้ว" : statusLabel(selected)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs" style={{ color: "hsl(var(--ng-soft))" }}>แหล่งที่มา</dt><dd className="font-medium">{selected.source || "-"}</dd></div>
          <div><dt className="text-xs" style={{ color: "hsl(var(--ng-soft))" }}>เบอร์โทร</dt><dd className="font-medium">{selected.phone || "-"}</dd></div>
          <div><dt className="text-xs" style={{ color: "hsl(var(--ng-soft))" }}>หน่วยงาน</dt><dd className="font-medium">{selected.org || "-"}</dd></div>
          <div>
            <dt className="text-xs" style={{ color: "hsl(var(--ng-soft))" }}>สถานะ LINE</dt>
            <dd className="font-medium">
              {selected.lineUserId ? (
                <span style={{ color: "hsl(var(--ng-green-deep))" }}>จับคู่แล้ว</span>
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <span style={{ color: "hsl(var(--ng-orange-deep))" }}>ยังไม่ได้ส่ง LINE — รอจับคู่ลูกค้า</span>
                  <button type="button" className="underline" data-testid="work-open-match-inline" onClick={() => setMatchOpen(true)}>
                    จับคู่ลูกค้า
                  </button>
                </span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" data-testid="work-open-chat" onClick={() => setChatOpen(true)}>
            <MessageCircle className="mr-1 h-4 w-4" /> เปิดแชท
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-rose-600 hover:bg-rose-50"
            data-testid="work-delete"
            disabled={busy !== ""}
            onClick={() => void onDelete()}
          >
            <Trash2 className="mr-1 h-4 w-4" /> ลบรายการ
          </Button>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-xs" style={{ color: "hsl(var(--ng-soft))" }}>เปลี่ยนสถานะงานเร็ว</p>
          <StatusChips
            options={ORDER_FLOW}
            value={workStatusKey(selected)}
            onChange={(k) => void onSetStatus(k)}
            testId="work-status-chips"
          />
        </div>
      </div>

      <div className="portal-card">
        <h3 className="mb-2 text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>ไฟล์ต้นฉบับจากลูกค้า</h3>
        {filesLoading ? (
          <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>กำลังโหลดไฟล์…</p>
        ) : files.length === 0 ? (
          <p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>ไม่มีไฟล์แนบจากลูกค้า</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <FileText className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--ng-purple))" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  <span className="text-xs" style={{ color: "hsl(var(--ng-muted))" }}>{fmtSize(f.sizeBytes)}</span>
                </span>
                {f.url ? (
                  <>
                    <a href={f.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 hover:bg-accent" aria-label={`ดูไฟล์ ${f.name}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <a href={f.url} download={f.name} className="rounded-lg p-2 hover:bg-accent" aria-label={`ดาวน์โหลด ${f.name}`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: "hsl(var(--ng-soft))" }}>ไม่มีไฟล์จริง</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 1. ยืนยันรับรายการ */}
      <div className="portal-card">
        <h3 className="mb-2 text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>1. ยืนยันว่าได้รับรายการแล้ว</h3>
        <p className="whitespace-pre-line rounded-xl border border-border p-3 text-[15px]" style={{ background: "hsl(var(--ng-tint))" }}>
          {isOrderKind(selected.kind)
            ? "ได้รับคำสั่งซื้อเรียบร้อยแล้วค่ะ\nทางร้านจะดำเนินการจัดทำ และส่งไฟล์ใบส่งของให้เร็วที่สุดค่ะ"
            : "ได้รับใบเขียนเบิกเรียบร้อยแล้วค่ะ\nทางร้านจะดำเนินการจัดทำ และส่งไฟล์ใบส่งของให้เร็วที่สุดค่ะ"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isAcknowledged(selected) ? (
            <>
              <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "hsl(var(--ng-green-deep))" }}>
                <CheckCircle2 className="h-4 w-4" /> รับเรื่องแล้ว {fmtWhen(selected.acknowledgedAt)}
              </span>
              <Button variant="outline" className="h-11" disabled={busy !== ""} onClick={onResendAck}>
                {busy === "ack" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} ส่งข้อความอีกครั้ง
              </Button>
            </>
          ) : (
            <Button className="h-11" disabled={busy !== ""} onClick={onAck} data-testid="work-ack">
              {busy === "ack" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
              ยืนยันรับรายการและส่งข้อความ
            </Button>
          )}
        </div>
      </div>

      {/* 2. ยืนยันและแก้ราคา → สร้างใบเสนอราคาส่งลูกค้า */}
      <PriceEditor item={selected} onChanged={() => { void reload(); }} />

      {/* 3. ส่งใบส่งของ */}
      <div className="portal-card">
        <h3 className="mb-2 text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>3. ส่งใบส่งของกลับลูกค้า</h3>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        {selected.deliveryFile ? (
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <FileText className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--ng-pink))" }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{selected.deliveryFile.name}</span>
              <span className="text-xs" style={{ color: "hsl(var(--ng-muted))" }}>{fmtSize(selected.deliveryFile.sizeBytes)}</span>
            </span>
            <DeliveryLinks item={selected} />
            <Button variant="outline" size="sm" className="h-9" disabled={busy !== ""} onClick={() => fileInput.current?.click()}>
              เปลี่ยนไฟล์
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="h-11 w-full" disabled={busy !== ""} onClick={() => fileInput.current?.click()}>
            {busy === "upload" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            แนบไฟล์ใบส่งของ (PDF)
          </Button>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            className="h-11"
            data-testid="work-send"
            disabled={busy !== "" || !selected.deliveryFile}
            onClick={onSend}
          >
            {busy === "send" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {isSent(selected) ? "ส่งไฟล์อีกครั้ง" : "ส่งไฟล์ให้ลูกค้าทาง LINE"}
          </Button>
          {isSent(selected) && (
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--ng-green-deep))" }}>
              ส่งแล้ว {fmtWhen(selected.deliverySentAt)}
            </span>
          )}
          {!selected.deliveryFile && (
            <span className="text-xs" style={{ color: "hsl(var(--ng-muted))" }}>แนบไฟล์ PDF ก่อนจึงจะส่งได้ (แนบไว้ก่อนได้ ไม่ต้องส่งทันที)</span>
          )}
        </div>
      </div>

      {/* ประวัติการส่งข้อความ (อ่านอย่างเดียว) — เปิดเมื่อกดเท่านั้น */}
      <details className="ng-card" data-testid="work-timeline">
        <summary className="cursor-pointer text-[15px] font-bold" style={{ color: "hsl(var(--ng-ink))" }}>
          ประวัติการส่งข้อความของงานนี้
        </summary>
        <div className="mt-3">
          <Suspense fallback={<p className="text-sm" style={{ color: "hsl(var(--ng-muted))" }}>กำลังโหลด…</p>}>
            <OrderDeliveryTimeline orderId={selected.id} />
          </Suspense>
        </div>
      </details>
    </div>

  );

  return (
    <DashboardShell>
      <div className="portal-canvas -m-4 min-h-full p-4 pb-20 lg:-m-6 lg:p-6 lg:pb-0" data-testid="admin-work-docs">
        <div className="ng-page">
        <header className="mb-6 flex flex-col gap-3 border-b border-[hsl(var(--portal-line))] pb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Work center</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              <FolderOpen className="h-6 w-6 shrink-0 text-primary" />
              <span className="truncate">งานและเอกสาร</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationsPanel />
            <Button className="h-10 flex-1 sm:flex-none" data-testid="work-new" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> รับงานใหม่
            </Button>
            <Button
              variant="outline"
              className="h-10 w-10 shrink-0 p-0 sm:w-auto sm:px-3"
              data-testid="work-open-match"
              aria-label="จับคู่ลูกค้า & LINE"
              onClick={() => setMatchOpen(true)}
            >
              <Link2 className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">จับคู่ลูกค้า &amp; LINE</span>
            </Button>
            <Button
              variant="outline"
              className="h-10 w-10 shrink-0 p-0 sm:w-auto sm:px-3"
              data-testid="work-export-csv"
              aria-label="ส่งออก CSV"
              onClick={onExportCsv}
            >
              <Download className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">ส่งออก CSV</span>
            </Button>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto" role="tablist" aria-label="กลุ่มงาน">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={!todoOnly && tab === t.key}
                onClick={() => setParam({ tab: t.key, todo: null, id: null })}
                className={`min-h-10 rounded-xl px-3 text-[14px] font-bold transition-colors sm:px-4 ${
                  !todoOnly && tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
              ))}
            </div>
          </div>
        </header>

        <ChatOrderHints hints={hints} onCreate={onHintCreate} onDismiss={onHintDismiss} />

        {todoOnly && (
          <div className="ng-card mb-3 flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span style={{ color: "hsl(var(--ng-muted))" }}>กำลังดูเฉพาะงานที่รับเรื่องแล้วแต่ยังไม่ได้ส่งใบส่งของ</span>
            <button className="font-semibold underline" onClick={() => setParam({ todo: null })}>ดูทั้งหมด</button>
          </div>
        )}

         <div className="grid min-w-0 gap-3 xl:grid-cols-[38fr_62fr] xl:items-start">
           <div className={`min-w-0 ${selected ? "hidden xl:block" : "block"}`}>{listPane}</div>
           <div className={`min-w-0 ${selected ? "block" : "hidden xl:block"}`}>{detailPane}</div>
          </div>
        </div>
       </div>
      <NewWorkDialog
        open={newOpen}
        prefill={prefill}
        onOpenChange={(v) => { setNewOpen(v); if (!v) { setPrefill(null); setParam({ new: null }); } }}
         onSaved={(res) => {
           setParam({ new: null, filter: res.kind === "requisition" ? "requisition" : "order", kind: res.kind, id: res.id });
           const fromHint = prefill ? hints.find((h) => h.customerName === prefill.customerName) : null;
           if (fromHint) {
             setHints((prev) => prev.filter((h) => h.messageId !== fromHint.messageId));
             void markChatOrderHint(fromHint, "converted", { to: "order", id: res.id }).catch(() => undefined);
           }
           setPrefill(null);
           void reload();
         }}
      />
      {chatOpen && selected && (
        <Suspense fallback={null}>
          <CustomerChatDialog item={selected} onClose={() => setChatOpen(false)} />
        </Suspense>
      )}
      {matchOpen && (
        <Suspense fallback={null}>
          <LineMatchDialog onClose={() => { setMatchOpen(false); setParam({ match: null }); void reload(); }} />
        </Suspense>
      )}
      <AdminBottomNav />
    </DashboardShell>
  );
}

/** ปุ่มดู/ดาวน์โหลดใบส่งของที่แนบไว้ (สร้างลิงก์ตอนกด เพื่อไม่ให้ลิงก์หมดอายุ) */
function DeliveryLinks({ item }: { item: WorkItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const f = item.deliveryFile;
    if (!f) { setUrl(null); return; }
    import("@/lib/workDocs").then(({ signFile }) => signFile(f.bucket, f.path))
      .then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [item]);
  if (!url) return null;
  return (
    <>
      <a href={url} target="_blank" rel="noreferrer" className="rounded-lg p-2 hover:bg-accent" aria-label="ดูใบส่งของ">
        <ExternalLink className="h-4 w-4" />
      </a>
      <a href={url} download={item.deliveryFile?.name} className="rounded-lg p-2 hover:bg-accent" aria-label="ดาวน์โหลดใบส่งของ">
        <Download className="h-4 w-4" />
      </a>
    </>
  );
}
