import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, Phone, Search, Copy, Trash2, Pencil, Link2,
  ShieldCheck, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Download, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { relativeTimeTH } from "@/lib/lineSession";
import { friendStatusLabel, friendStatusTone, friendReasonTH, maskLineUserId, type FriendStatus } from "@/lib/lineFriend";
import {
  readFriendCache, setCachedFriend, filterUncached, clearFriendCache,
  DEFAULT_FRIEND_TTL_MS, type FriendCacheMap,
} from "@/lib/friendCheckCache";

type Row = {
  phone: string;
  line_user_id: string;
  display_name: string | null;
  bound_at: string;
  updated_at: string;
};

type Enrichment = {
  orderCount: number;
  lastOrgName: string | null;
  lastSchoolName: string | null;
  lastCreatedAt: string | null;
  lastPendingWithoutLineCount: number;
};

type FriendMap = FriendCacheMap;

const PAGE_SIZE = 50;

type StatusFilter = "all" | "confirmed" | "not_friend" | "unknown" | "failed" | "unchecked";
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "confirmed", label: "เป็นเพื่อนแล้ว" },
  { key: "not_friend", label: "ยังไม่เพิ่มเพื่อน" },
  { key: "unknown", label: "ตรวจไม่ได้" },
  { key: "failed", label: "ตรวจล้มเหลว" },
  { key: "unchecked", label: "ยังไม่ตรวจ" },
];

function toneClass(t: ReturnType<typeof friendStatusTone>): string {
  if (t === "success") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (t === "warning") return "bg-amber-100 text-amber-800 border-amber-200";
  if (t === "destructive") return "bg-rose-100 text-rose-800 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function StatusIcon({ status }: { status: FriendStatus | null }) {
  if (status === "confirmed") return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
  if (status === "not_friend") return <XCircle className="w-4 h-4 text-amber-600" />;
  if (status === "unknown" || status === "config_missing") return <AlertTriangle className="w-4 h-4 text-rose-600" />;
  return <HelpCircle className="w-4 h-4 text-slate-400" />;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); }
  catch { return v; }
}

export default function AdminLinePhoneBindings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [enrich, setEnrich] = useState<Record<string, Enrichment>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [friendMap, setFriendMap] = useState<FriendMap>(() => readFriendCache());
  const [checkingAll, setCheckingAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [deleting, setDeleting] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editLuid, setEditLuid] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [binding, setBinding] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("line_phone_bindings")
        .select("phone, line_user_id, display_name, bound_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const base = (data || []) as Row[];
      setRows(base);
      // enrichment
      if (base.length) {
        const phones = base.map(r => r.phone);
        const { data: ords } = await supabase
          .from("orders")
          .select("guest_phone, organization_id, school_name, line_user_id, created_at")
          .in("guest_phone", phones)
          .order("created_at", { ascending: false })
          .limit(2000);
        const orgIds = Array.from(new Set((ords || []).map((o: any) => o.organization_id).filter(Boolean)));
        const orgMap = new Map<string, string>();
        if (orgIds.length) {
          const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
          (orgs || []).forEach((o: any) => orgMap.set(o.id, o.name));
        }
        const acc: Record<string, Enrichment> = {};
        for (const p of phones) acc[p] = { orderCount: 0, lastOrgName: null, lastSchoolName: null, lastCreatedAt: null, lastPendingWithoutLineCount: 0 };
        for (const o of (ords || []) as any[]) {
          const p = o.guest_phone as string;
          if (!p || !acc[p]) continue;
          acc[p].orderCount += 1;
          if (!o.line_user_id) acc[p].lastPendingWithoutLineCount += 1;
          if (!acc[p].lastCreatedAt) {
            acc[p].lastCreatedAt = o.created_at;
            acc[p].lastOrgName = o.organization_id ? (orgMap.get(o.organization_id) || null) : null;
            acc[p].lastSchoolName = o.school_name || null;
          }
        }
        setEnrich(acc);
      } else {
        setEnrich({});
      }
    } catch (e: any) {
      toast.error(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (s) {
        const en = enrich[r.phone];
        const hay = [
          r.phone, r.line_user_id, r.display_name || "",
          en?.lastOrgName || "", en?.lastSchoolName || "",
        ].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (statusFilter === "all") return true;
      const f = friendMap[r.line_user_id];
      const status = f?.status ?? null;
      const http = f?.http_status ?? 0;
      switch (statusFilter) {
        case "confirmed": return status === "confirmed";
        case "not_friend": return status === "not_friend";
        case "unknown": return status === "unknown" || status === "config_missing";
        case "failed":
          // "ตรวจล้มเหลว" — ตรวจแล้วเจอปัญหาจริง (config/API/network) ไม่ใช่แค่ยังไม่ได้เพิ่มเพื่อน
          return !!f && (status === "config_missing" || (status === "unknown" && (!!f.reason && f.reason !== "not_friend") ) || http >= 400);
        case "unchecked": return !f;
        default: return true;
      }
    });
  }, [rows, q, enrich, friendMap, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function invokeCheck(ids: string[]): Promise<FriendMap> {
    const { data, error } = await supabase.functions.invoke("admin-line-binding-friend-check", {
      body: { line_user_ids: ids },
    });
    if (error) {
      const reason = /forbidden/i.test(error.message) ? "forbidden"
        : /unauthorized/i.test(error.message) ? "unauthorized"
        : "internal_error";
      const now = new Date().toISOString();
      const stub: FriendMap = {};
      for (const id of ids) stub[id] = { status: "unknown", checked_at: now, reason };
      return stub;
    }
    return ((data as any)?.results || {}) as FriendMap;
  }

  async function checkFriend(row: Row) {
    // Row-level button is an explicit intent — bypass cache.
    clearFriendCache([row.line_user_id]);
    try {
      const results = await invokeCheck([row.line_user_id]);
      const entry = results[row.line_user_id] ?? {
        status: "unknown" as FriendStatus,
        checked_at: new Date().toISOString(),
        reason: "internal_error",
      };
      const patch: FriendMap = { [row.line_user_id]: entry };
      setFriendMap(m => ({ ...m, ...patch }));
      setCachedFriend(patch);
      if (entry.status === "confirmed") toast.success("เป็นเพื่อน OA แล้ว");
      else {
        const msg = friendReasonTH(entry.reason, entry.http_status) || friendStatusLabel(entry.status);
        entry.status === "not_friend" ? toast.warning(msg) : toast.error(msg);
      }
    } catch (e: any) {
      toast.error(e?.message || "ตรวจสอบไม่สำเร็จ");
    }
  }

  async function checkAllOnPage() {
    setCheckingAll(true);
    try {
      const ids = pageRows.map(r => r.line_user_id);
      const need = filterUncached(ids, DEFAULT_FRIEND_TTL_MS);
      const cachedHits = ids.length - need.length;
      if (need.length === 0) {
        toast.message(`ใช้ผลจากแคช ${cachedHits} รายการ (อายุไม่เกิน 5 นาที)`);
        return;
      }
      const results = await invokeCheck(need);
      setFriendMap(m => ({ ...m, ...results }));
      setCachedFriend(results);
      const missCfg = Object.values(results).some(r => r?.reason === "config_missing");
      if (missCfg) toast.error(friendReasonTH("config_missing")!);
      else toast.success(`ตรวจสอบสถานะ ${Object.keys(results).length} รายการ${cachedHits ? ` (+${cachedHits} จากแคช)` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "ตรวจสอบไม่สำเร็จ");
    } finally { setCheckingAll(false); }
  }

  function copyText(v: string) {
    try { navigator.clipboard.writeText(v); toast.success("คัดลอกแล้ว"); } catch { /* ignore */ }
  }

  async function doDelete() {
    if (!deleting) return;
    const row = deleting;
    try {
      const { error } = await supabase.from("line_phone_bindings").delete().eq("phone", row.phone);
      if (error) throw error;
      setRows(rs => rs.filter(r => r.phone !== row.phone));
      toast.success("ลบรายการแล้ว");
    } catch (e: any) {
      toast.error(e?.message || "ลบไม่สำเร็จ");
    } finally { setDeleting(null); }
  }

  function openEdit(row: Row) {
    setEditing(row);
    setEditLuid(row.line_user_id);
    setEditName(row.display_name || "");
  }

  async function saveEdit() {
    if (!editing) return;
    const luid = editLuid.trim();
    if (!/^U[0-9a-f]{32}$/.test(luid)) {
      toast.error("line_user_id ต้องขึ้นต้นด้วย U ตามด้วย hex 32 ตัว");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("line_phone_bindings")
        .update({ line_user_id: luid, display_name: editName.trim() || null, updated_at: new Date().toISOString() })
        .eq("phone", editing.phone);
      if (error) throw error;
      setRows(rs => rs.map(r => r.phone === editing.phone ? { ...r, line_user_id: luid, display_name: editName.trim() || null } : r));
      toast.success("บันทึกแล้ว");
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  }

  async function backfillOrders(row: Row) {
    setBinding(row);
    try {
      const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("orders")
        .update({ line_user_id: row.line_user_id })
        .eq("guest_phone", row.phone)
        .is("line_user_id", null)
        .gte("created_at", cutoff)
        .select("id");
      if (error) throw error;
      const n = (data || []).length;
      toast.success(n ? `ผูก LINE เข้ากับ ${n} ออเดอร์แล้ว` : "ไม่มีออเดอร์ค้างที่ต้องผูก");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "ผูกออเดอร์ไม่สำเร็จ");
    } finally { setBinding(null); }
  }

  function exportCsv() {
    const header = ["phone", "line_user_id", "display_name", "org_name", "school_name", "order_count", "pending_no_line", "bound_at", "updated_at"];
    const lines = [header.join(",")];
    for (const r of filtered) {
      const en = enrich[r.phone];
      const cells = [
        r.phone,
        r.line_user_id,
        r.display_name || "",
        en?.lastOrgName || "",
        en?.lastSchoolName || "",
        String(en?.orderCount ?? 0),
        String(en?.lastPendingWithoutLineCount ?? 0),
        r.bound_at,
        r.updated_at,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `line_phone_bindings_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <SeoHead title="เบอร์ ↔ LINE (auto-bind) — แอดมิน" description="จัดการรายการผูกเบอร์กับ LINE ที่ระบบผูกอัตโนมัติ" path="/admin/line-phone-bindings" />
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Phone className="w-6 h-6 text-emerald-600" /> เบอร์ ↔ LINE (auto-bind)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            รายการ mapping ระหว่างเบอร์โทรกับ LINE user id ที่ระบบจดจำจาก webhook / การยืนยันตัวตน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            รีเฟรช
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-3 mb-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="ค้นหา: เบอร์ / line_user_id / ชื่อ LINE / ร้าน / หน่วยงาน"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={checkAllOnPage} disabled={checkingAll || !pageRows.length}>
          {checkingAll ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
          ตรวจสถานะเพื่อนทั้งหน้า
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="กรองตามสถานะเพื่อน">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs border transition ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground/80 border-border hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">ชื่อ LINE</th>
                <th className="text-left px-3 py-2">เบอร์</th>
                <th className="text-left px-3 py-2">line_user_id</th>
                <th className="text-left px-3 py-2">ร้าน / หน่วยงาน (ล่าสุด)</th>
                <th className="text-left px-3 py-2">ออเดอร์</th>
                <th className="text-left px-3 py-2">ผูกเมื่อ</th>
                <th className="text-left px-3 py-2">อัปเดต</th>
                <th className="text-left px-3 py-2">สถานะเพื่อน OA</th>
                <th className="text-right px-3 py-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> กำลังโหลด...
                </td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">ไม่พบรายการ</td></tr>
              ) : pageRows.map((r) => {
                const en = enrich[r.phone];
                const f = friendMap[r.line_user_id];
                const tone = friendStatusTone(f?.status ?? null);
                return (
                  <tr key={r.phone} className="border-t border-border">
                    <td className="px-3 py-2">{r.display_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 font-mono">{r.phone}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => copyText(r.line_user_id)}
                        className="inline-flex items-center gap-1 font-mono text-xs hover:text-primary"
                        title={r.line_user_id}
                      >
                        {maskLineUserId(r.line_user_id)} <Copy className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {en?.lastOrgName ? <div className="font-medium">{en.lastOrgName}</div> : null}
                      {en?.lastSchoolName ? <div className="text-xs text-muted-foreground">{en.lastSchoolName}</div> : null}
                      {!en?.lastOrgName && !en?.lastSchoolName ? <span className="text-muted-foreground">—</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <span>{en?.orderCount ?? 0}</span>
                        {(en?.lastPendingWithoutLineCount ?? 0) > 0 ? (
                          <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-900 w-fit">
                            ยังไม่ผูก {en?.lastPendingWithoutLineCount}
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={fmtDate(r.bound_at)}>{relativeTimeTH(r.bound_at)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground" title={fmtDate(r.updated_at)}>{relativeTimeTH(r.updated_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <Badge variant="outline" className={toneClass(tone) + " w-fit"}>
                            <StatusIcon status={(f?.status as FriendStatus) ?? null} />
                            <span className="ml-1">{f ? friendStatusLabel(f.status) : "ยังไม่ตรวจ"}</span>
                          </Badge>
                          {f && f.status !== "confirmed" ? (
                            (() => {
                              const msg = friendReasonTH(f.reason, f.http_status);
                              return msg ? (
                                <span className="text-[11px] text-rose-700/90 leading-tight max-w-[220px]" title={msg}>
                                  {msg}
                                </span>
                              ) : null;
                            })()
                          ) : null}
                          {f?.checked_at ? (
                            <span className="text-[10px] text-slate-400">ตรวจ {relativeTimeTH(f.checked_at)}</span>
                          ) : null}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => checkFriend(r)} title="ตรวจสอบสถานะ (บังคับ)">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Link to="/admin/home">
                          <Button size="sm" variant="ghost" title="ดูออเดอร์">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={binding?.phone === r.phone || (en?.lastPendingWithoutLineCount ?? 0) === 0}
                          onClick={() => backfillOrders(r)}
                          title="ผูกออเดอร์ที่ค้าง (90 วัน)"
                        >
                          {binding?.phone === r.phone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="แก้ไข">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} title="ลบ">
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30 text-xs">
          <span className="text-muted-foreground">
            {filtered.length ? `${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, filtered.length)} จาก ${filtered.length}` : "—"}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>ก่อนหน้า</Button>
            <span className="text-muted-foreground">หน้า {page + 1} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>ถัดไป</Button>
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบ mapping เบอร์นี้?</AlertDialogTitle>
            <AlertDialogDescription>
              จะลบเฉพาะแถวใน `line_phone_bindings` เท่านั้น ออเดอร์เดิมจะไม่ถูกแตะ
              <div className="mt-2 text-xs font-mono">{deleting?.phone} → {deleting ? maskLineUserId(deleting.line_user_id) : ""}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไข mapping (เบอร์ {editing?.phone})</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">line_user_id</label>
              <Input value={editLuid} onChange={(e) => setEditLuid(e.target.value)} className="font-mono" />
              <p className="text-[11px] text-muted-foreground mt-1">รูปแบบ: U ตามด้วย hex 32 ตัว</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ชื่อที่แสดง</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}