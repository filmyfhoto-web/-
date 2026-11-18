import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import BulkActionBar from "@/components/table/BulkActionBar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LineLinkPanel from "./LineLinkPanel";
import {
  Bell, CheckCheck, ClipboardList, MessageCircle, Pencil, Search, Settings, ShoppingCart, Trash2,
} from "lucide-react";

import { fmtDateTime } from "@/lib/format";
import { useDebounced } from "@/hooks/useDebounced";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import {
  catalogFor, friendlyBody, friendlyTime, groupOf, isNoise, isRawErrorCode,
  matchesQuery, matchesStatus, relatedLinks, resolveActions, withinRange,
  DATE_RANGES, GROUP_STYLE, READ_STATUSES,
  type DateRange, type HubGroup, type ReadStatus,
} from "./notificationCatalog";
import { loadHubFilters, saveHubFilters } from "./hubFilterPrefs";
import type { HubData, HubNotification } from "./useHubData";

type Filter = "todo" | "order" | "requisition" | "line" | "done";

const PAGE_SIZE = 10;


const ICON: Record<HubGroup, typeof Bell> = {
  order: ShoppingCart, requisition: ClipboardList, line: MessageCircle, system: Bell,
};

/** กลุ่มที่ใช้กรอง (คงชื่อเดิมไว้เพื่อความเข้ากันได้ของเทสต์เก่า) */
export function notificationGroup(type: string | null | undefined): HubGroup {
  return groupOf(type);
}

export function quickActionFor(n: Pick<HubNotification, "type" | "link" | "ref_id">) {
  const actions = resolveActions({ ...n, title: null, body: null });
  return actions[actions.length - 1];
}

/** การ์ดตัวเลขด้านบน */
function TopCard({ tone, label, value, foot, testId }: {
  tone: "primary" | HubGroup; label: string; value: number | string; foot?: string; testId?: string;
}) {
  const primary = tone === "primary";
  const style = primary ? null : GROUP_STYLE[tone as HubGroup];
  return (
    <div
      data-testid={testId}
      className={`ng-card p-4 flex items-center gap-3 ${primary ? "bg-primary text-white border-primary" : ""}`}
    >
      <span className={`w-12 h-12 grid place-items-center ${primary ? "bg-white/15" : style!.icon}`}>
        {primary ? <Bell className="w-6 h-6" /> : (() => { const I = ICON[tone as HubGroup]; return <I className="w-6 h-6" />; })()}
      </span>
      <div className="min-w-0">
        <div className={`text-sm ${primary ? "text-white/80" : "text-muted-foreground"}`}>{label}</div>
        <div className="text-3xl font-extrabold tabular-nums leading-tight">{value}</div>
        {foot && <div className={`text-xs mt-0.5 ${primary ? "text-white/80" : "text-muted-foreground"}`}>{foot}</div>}
      </div>
    </div>
  );
}

export default function NotificationsTab({ data }: { data: HubData }) {
  const navigate = useNavigate();
  const saved = useMemo(() => loadHubFilters(), []);
  const [filter, setFilter] = useState<Filter>(saved.filter);
  const [queryInput, setQueryInput] = useState(saved.query);
  const query = useDebounced(queryInput, 300);
  const [range, setRange] = useState<DateRange>(saved.range);
  const [status, setStatus] = useState<ReadStatus>(saved.status);
  const [sortDesc, setSortDesc] = useState(saved.sortDesc);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<HubNotification | null>(null);
  const [editing, setEditing] = useState<HubNotification | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<HubNotification | null>(null);
  const { notifications } = data;

  function startEdit(n: HubNotification) {
    setEditing(n);
    setEditTitle(n.title ?? "");
    setEditBody(n.body ?? "");
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const { error } = await (supabase as any).from("notifications")
      .update({ title: editTitle.trim() || null, body: editBody.trim() || null })
      .eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ ลองอีกครั้ง"); return; }
    setEditing(null);
    await data.reload();
    toast.success("แก้ไขข้อความแจ้งเตือนแล้ว");
  }

  async function removeOne() {
    if (!toDelete) return;
    const { error } = await (supabase as any).from("notifications").delete().eq("id", toDelete.id);
    if (error) { toast.error("ลบไม่สำเร็จ ลองอีกครั้ง"); return; }
    setToDelete(null);
    await data.reload();
    toast.success("ลบรายการแจ้งเตือนแล้ว");
  }

  async function bulkDelete(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`ลบรายการที่เลือก ${ids.length} รายการ?`)) return;
    const { error } = await (supabase as any).from("notifications").delete().in("id", ids);
    if (error) { toast.error("ลบไม่สำเร็จ ลองอีกครั้ง"); return; }
    bulk.clear();
    await data.reload();
    toast.success(`ลบแล้ว ${ids.length} รายการ`);
  }


  // จำค่าฟิลเตอร์ไว้ให้อยู่ต่อเมื่อรีเฟรชหน้า
  useEffect(() => {
    saveHubFilters({ filter, range, status, query: queryInput, sortDesc });
  }, [filter, range, status, queryInput, sortDesc]);


  /** งานที่ต้องทำ = ยังไม่อ่าน และไม่ใช่ noise ทางเทคนิค */
  const todo = useMemo(() => notifications.filter((n) => !n.read && !isNoise(n.type)), [notifications]);
  const done = useMemo(() => notifications.filter((n) => n.read || isNoise(n.type)), [notifications]);

  const counts = useMemo(() => ({
    todo: todo.length,
    order: todo.filter((n) => groupOf(n.type) === "order").length,
    requisition: todo.filter((n) => groupOf(n.type) === "requisition").length,
    line: todo.filter((n) => groupOf(n.type) === "line").length,
    done: done.length,
    loginFail: todo.filter((n) => String(n.type) === "line_login_failure").length,
  }), [todo, done]);

  const latestOrder = todo.find((n) => groupOf(n.type) === "order");

  const view = useMemo(() => {
    const base = filter === "done" ? done : filter === "todo" ? todo : todo.filter((n) => groupOf(n.type) === filter);
    const list = base.filter(
      (n) => matchesQuery(n, query) && withinRange(n.created_at, range) && matchesStatus(n, status),
    );
    return [...list].sort((a, b) => {
      const d = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return sortDesc ? d : -d;
    });
  }, [filter, todo, done, query, sortDesc, range, status]);

  // เปลี่ยนตัวกรอง/คำค้น = กลับไปหน้าแรกเสมอ
  useEffect(() => { setPage(1); }, [filter, query, range, status, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = view.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // เลือกหลายงานพร้อมกัน (ขอบเขต = รายการที่แสดงอยู่ในหน้านี้)
  const bulk = useBulkSelect(rows);
  useEffect(() => { bulk.clear(); }, [filter, query, range, status, current]); // eslint-disable-line react-hooks/exhaustive-deps

  /** อัปเดตสถานะอ่านหลายรายการในครั้งเดียว แล้วดึงข้อมูลใหม่ให้ตัวนับตรงกันทุกเครื่อง */
  async function bulkMarkRead(ids: string[]): Promise<boolean> {
    if (!ids.length) return false;
    const { error } = await (supabase as any).from("notifications").update({ read: true }).in("id", ids);
    if (error) { toast.error("อัปเดตไม่สำเร็จ ลองอีกครั้ง"); return false; }
    await data.reload();
    return true;
  }

  async function bulkDone(ids: string[]) {
    if (!(await bulkMarkRead(ids))) return;
    bulk.clear();
    toast.success(`บันทึกว่าดำเนินการแล้ว ${ids.length} รายการ`);
  }

  async function bulkResend(ids: string[]) {
    if (!(await bulkMarkRead(ids))) return;
    bulk.clear();
    toast.success(`ส่งลิงก์ใหม่ ${ids.length} รายการ`, { description: "เปิดหน้ารายชื่อลูกค้า & LINE OA เพื่อส่งลิงก์" });
    navigate("/admin/work-docs?match=1");
  }



  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) {
      toast.info("ไม่มีรายการที่ยังไม่อ่าน");
      return;
    }
    const { error } = await (supabase as any).from("notifications").update({ read: true }).in("id", ids);
    if (error) { toast.error("อัปเดตไม่สำเร็จ ลองอีกครั้ง"); return; }
    await data.reload();
    toast.success(`ทำเครื่องหมายอ่านแล้ว ${ids.length} รายการ`);
  }

  async function setRead(id: string, read: boolean, notify = false) {
    const { error } = await (supabase as any).from("notifications").update({ read }).eq("id", id);
    if (error) { toast.error("อัปเดตสถานะไม่สำเร็จ"); return; }
    await data.reload();
    if (notify) toast.success(read ? "ย้ายไปแท็บ “ดำเนินการแล้ว”" : "ทำเครื่องหมายว่ายังไม่อ่าน");
  }

  /** กดปุ่มงาน: ยืนยันด้วย toast + อัปเดตสถานะเป็นดำเนินการแล้วทันที */
  function onActionClick(n: HubNotification, label: string) {
    toast.success(`${label} — บันทึกว่าดำเนินการแล้ว`, { description: n.title || catalogFor(n.type).label });
    if (!n.read) void setRead(n.id, true);
  }

  function openDetail(n: HubNotification) {
    setDetail(n);
    if (!n.read) void setRead(n.id, true);
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "todo", label: "ต้องทำก่อน", count: counts.todo },
    { key: "order", label: "ออเดอร์ใหม่", count: counts.order },
    { key: "requisition", label: "ใบเบิก", count: counts.requisition },
    { key: "line", label: "LINE OA", count: counts.line },
    { key: "done", label: "ดำเนินการแล้ว", count: counts.done },
  ];

  return (
    <div className="space-y-4" data-testid="hub-notifications">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">ศูนย์รวมงานหน้าร้าน</p>
          <h2 className="text-2xl font-extrabold">งานที่ต้องทำวันนี้</h2>
          <p className="text-sm text-muted-foreground">รวมเฉพาะรายการที่ต้องดำเนินการ เพื่อให้เห็นงานสำคัญและทำต่อได้ทันที</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void markAllRead()} data-testid="hub-mark-all-read">
            <CheckCheck className="w-4 h-4 mr-1" /> อ่านแล้วทั้งหมด
          </Button>
          <Button asChild variant="secondary" size="sm" data-testid="hub-noti-settings">
            <Link to="/admin/notification-settings"><Settings className="w-4 h-4 mr-1" /> ตั้งค่าการแจ้งเตือน</Link>
          </Button>
        </div>
      </div>

      {/* ตัวเลขรวมด้านบน */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TopCard tone="primary" label="รอดำเนินการทั้งหมด" value={`${counts.todo} รายการ`} foot={`ดำเนินการแล้ว ${counts.done} รายการ`} testId="hub-card-todo" />
        <TopCard tone="order" label="ออเดอร์ใหม่" value={counts.order} foot={latestOrder ? `ใหม่ล่าสุด ${friendlyTime(latestOrder.created_at)}` : "ไม่มีรายการค้าง"} testId="hub-card-order" />
        <TopCard tone="requisition" label="ใบเบิกใหม่" value={counts.requisition} foot={counts.requisition ? "รออนุมัติ" : "ไม่มีรายการค้าง"} testId="hub-card-req" />
        <TopCard tone="line" label="LINE ต้องตรวจสอบ" value={counts.line} foot={counts.loginFail ? `เข้าสู่ระบบไม่สำเร็จ ${counts.loginFail}` : "ปกติดี"} testId="hub-card-line" />
      </div>

      <section className="ng-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                data-testid={`hub-noti-filter-${f.key}`}
                onClick={() => setFilter(f.key)}
                className={`px-3 h-9 text-sm border transition-colors ${filter === f.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-background hover:bg-accent/40"}`}
              >
                {f.label} <span className="ml-1 text-xs opacity-80">{f.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="ค้นหาลูกค้า หรือเลขออเดอร์"
                className="pl-8 h-9 w-56"
                data-testid="hub-noti-search"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setSortDesc((v) => !v)} data-testid="hub-noti-sort">
              {sortDesc ? "ใหม่ล่าสุด" : "เก่าสุดก่อน"}
            </Button>
          </div>
        </div>

        {/* ช่วงวันที่ + สถานะ */}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <span className="text-xs text-muted-foreground">ช่วงวันที่</span>
          <div className="flex flex-wrap gap-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                data-testid={`hub-noti-range-${r.key}`}
                onClick={() => setRange(r.key)}
                className={`px-3 h-8 text-sm border transition-colors ${range === r.key
                  ? "border-primary bg-accent text-primary font-semibold"
                  : "border-border bg-background hover:bg-accent/40"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-2">สถานะ</span>
          <div className="flex flex-wrap gap-1">
            {READ_STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                data-testid={`hub-noti-status-${s.key}`}
                onClick={() => setStatus(s.key)}
                className={`px-3 h-8 text-sm border transition-colors ${status === s.key
                  ? "border-primary bg-accent text-primary font-semibold"
                  : "border-border bg-background hover:bg-accent/40"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-auto" data-testid="hub-noti-result-count">
            พบ {view.length} รายการ
          </span>
        </div>

        <BulkActionBar
          count={bulk.count}
          total={rows.length}
          allSelected={bulk.allSelected}
          onToggleAll={bulk.toggleAll}
          onClear={bulk.clear}
          selectedIds={bulk.selectedArray}
          actions={[
            { label: "ดำเนินการแล้ว", icon: CheckCheck, onRun: (ids) => void bulkDone(ids) },
            { label: "ส่งลิงก์ใหม่", icon: MessageCircle, onRun: (ids) => void bulkResend(ids) },
            { label: "ลบที่เลือก", icon: Trash2, destructive: true, onRun: (ids) => void bulkDelete(ids) },

          ]}
        />

        <ul className="divide-y divide-border border border-border">

          {data.loading && [0, 1, 2].map((i) => (
            <li key={i} className="p-3"><div className="h-8 bg-muted animate-pulse" /></li>
          ))}
          {!data.loading && rows.map((n) => {
            const cat = catalogFor(n.type);
            const style = GROUP_STYLE[cat.group];
            const Icon = ICON[cat.group];
            const actions = resolveActions(n);
            return (
              <li
                key={n.id}
                data-testid="hub-noti-row"
                className="flex items-center hover:bg-accent/30 transition-colors"
              >
                <span className={`w-1 self-stretch shrink-0 ${style.bar}`} />
                <label className="pl-2 flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={bulk.ids.has(n.id)}
                    onCheckedChange={() => bulk.toggle(n.id)}
                    aria-label={`เลือกงาน ${n.title || cat.label}`}
                    data-testid="hub-noti-select"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => openDetail(n)}
                  className="flex-1 min-w-0 text-left px-2 py-2 flex items-center gap-2"
                  data-testid="hub-noti-open"
                >
                  <span className={`w-7 h-7 shrink-0 grid place-items-center ${style.icon}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`border px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${style.chip}`}>{cat.badge}</span>
                      <span className="text-sm font-bold truncate">{n.title || cat.label}</span>
                      {!n.read && <span className="text-[10px] font-semibold text-primary shrink-0">● ใหม่</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {friendlyTime(n.created_at)} · {friendlyBody(n.body, cat.hint)}
                    </span>
                  </span>
                </button>
                <div className="px-2 py-1.5 flex items-center gap-1 shrink-0">
                  {actions.slice(-1).map((a) => (
                    <Button
                      key={a.label}
                      asChild
                      size="sm"
                      className="h-8 bg-primary hover:bg-primary text-white"
                      data-testid="hub-noti-action"
                    >
                      <Link to={a.to} onClick={() => onActionClick(n, a.label)}>{a.label}</Link>
                    </Button>
                  ))}
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8"
                    title="แก้ไขข้อความแจ้งเตือน" aria-label="แก้ไข"
                    onClick={() => startEdit(n)} data-testid="hub-noti-edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                    title="ลบรายการนี้" aria-label="ลบ"
                    onClick={() => setToDelete(n)} data-testid="hub-noti-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            );
          })}
          {!data.loading && view.length === 0 && (
            <li className="p-10 text-center text-sm text-muted-foreground">
              {filter === "done" ? "ยังไม่มีรายการที่ดำเนินการแล้ว" : "ไม่มีงานค้างในกลุ่มนี้ 🎉"}
            </li>
          )}
        </ul>


        {!data.loading && view.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 mt-3" data-testid="hub-noti-pager">
            <span className="text-xs text-muted-foreground">
              หน้า {current} / {pageCount} · แสดง {rows.length} จาก {view.length} รายการ
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm" disabled={current <= 1}
                onClick={() => setPage(current - 1)} data-testid="hub-noti-prev"
              >
                ก่อนหน้า
              </Button>
              <Button
                variant="outline" size="sm" disabled={current >= pageCount}
                onClick={() => setPage(current + 1)} data-testid="hub-noti-next"
              >
                ถัดไป
              </Button>
            </div>
          </div>
        )}
      </section>

      <LineLinkPanel data={data} />

      {/* แก้ไขข้อความแจ้งเตือน */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md" data-testid="hub-noti-edit-dialog">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อความแจ้งเตือน</DialogTitle>
            <DialogDescription>แก้หัวข้อและรายละเอียดให้พนักงานอ่านเข้าใจง่ายขึ้น</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="หัวข้อ" data-testid="hub-noti-edit-title" />
            <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={4} placeholder="รายละเอียด" data-testid="hub-noti-edit-body" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button size="sm" disabled={saving} onClick={() => void saveEdit()} data-testid="hub-noti-edit-save">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ยืนยันลบ */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent data-testid="hub-noti-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการแจ้งเตือนนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.title || "รายการนี้"} — ลบแล้วไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeOne()} data-testid="hub-noti-delete-confirm">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg" data-testid="hub-noti-detail">
          {detail && (() => {
            const cat = catalogFor(detail.type);
            const actions = resolveActions(detail);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg">{detail.title || cat.label}</DialogTitle>
                  <DialogDescription>{cat.label} — {cat.hint}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 text-sm">
                  <p>{friendlyBody(detail.body, cat.hint)}</p>
                  <p className="text-muted-foreground">เวลาที่แจ้ง: {fmtDateTime(detail.created_at)}</p>
                  {detail.ref_id && <p className="text-muted-foreground break-all">รหัสอ้างอิง: {detail.ref_id}</p>}
                  {isRawErrorCode(detail.body) && (
                    <p className="text-xs text-muted-foreground break-all">รหัสทางเทคนิค: {detail.body}</p>
                  )}
                  <p className="text-xs text-muted-foreground">ชนิดแจ้งเตือน: {detail.type ?? "-"}</p>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">ไปยังหน้าที่เกี่ยวข้อง</p>
                    <div className="flex flex-wrap gap-2">
                      {relatedLinks(detail).map((a) => (
                        <Button key={a.label} asChild size="sm" variant="outline">
                          <Link to={a.to} onClick={() => setDetail(null)}>{a.label}</Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" onClick={() => void setRead(detail.id, !detail.read, true)}>
                    {detail.read ? "ทำเครื่องหมายยังไม่อ่าน" : "ทำเครื่องหมายอ่านแล้ว"}
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link to={`/admin/customer-hub/n/${detail.id}`} onClick={() => setDetail(null)}>ดูรายละเอียดทั้งหมด</Link>
                  </Button>
                  {actions.map((a) => (
                    <Button key={a.label} asChild size="sm" variant={a.variant === "secondary" ? "outline" : "default"}>
                      <Link to={a.to} onClick={() => { onActionClick(detail, a.label); setDetail(null); }}>{a.label}</Link>
                    </Button>
                  ))}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
