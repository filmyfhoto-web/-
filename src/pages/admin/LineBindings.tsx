import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Users, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { relativeTimeTH } from "@/lib/lineSession";
import { friendStatusLabel, friendStatusTone, friendReasonTH, maskLineUserId, type FriendStatus } from "@/lib/lineFriend";
import {
  readFriendCache, setCachedFriend, filterUncached, clearFriendCache,
  DEFAULT_FRIEND_TTL_MS, type FriendCacheMap,
} from "@/lib/friendCheckCache";

type BindingRow = {
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  phone: string | null;
  customer_id: string | null;
  customer_source: string | null;
  verified_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  customer_name?: string | null;
};

type FriendCache = FriendCacheMap;

const PAGE_SIZE = 25;

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอการยืนยัน / ผูกไม่สำเร็จ" },
  { key: "confirmed", label: "เป็นเพื่อนแล้ว" },
  { key: "not_friend", label: "ยังไม่ได้เพิ่มเพื่อน" },
  { key: "unknown", label: "ตรวจสอบไม่ได้" },
  { key: "unchecked", label: "ยังไม่ได้ตรวจ" },
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

export default function AdminLineBindings() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BindingRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("pending");
  const [page, setPage] = useState(0);
  const [checking, setChecking] = useState(false);
  const [friendCache, setFriendCache] = useState<FriendCache>(() => readFriendCache());

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("line_account_links")
        .select("line_user_id, display_name, picture_url, phone, customer_id, customer_source, verified_at, last_seen_at, created_at")
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      const base = (data || []) as BindingRow[];
      // enrich with customer names in bulk
      const rdsIds = base.filter(r => r.customer_source === "rds" && r.customer_id).map(r => r.customer_id!);
      const guestIds = base.filter(r => r.customer_source === "guest" && r.customer_id).map(r => r.customer_id!);
      const [rdsRes, guestRes] = await Promise.all([
        rdsIds.length ? supabase.from("rds_customers").select("id, name").in("id", rdsIds) : Promise.resolve({ data: [] as any[] }),
        guestIds.length ? supabase.from("guest_customers").select("id, name").in("id", guestIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const nameMap = new Map<string, string>();
      (rdsRes.data || []).forEach((r: any) => nameMap.set(`rds:${r.id}`, r.name || ""));
      (guestRes.data || []).forEach((r: any) => nameMap.set(`guest:${r.id}`, r.name || ""));
      const enriched = base.map(r => ({
        ...r,
        customer_name: r.customer_id ? nameMap.get(`${r.customer_source}:${r.customer_id}`) ?? null : null,
      }));
      setRows(enriched);
    } catch (e: any) {
      toast.error(e?.message || "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      // text search
      if (s) {
        const hay = [r.display_name, r.phone, r.line_user_id, r.customer_name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      const status = friendCache[r.line_user_id]?.status;
      switch (filter) {
        case "all": return true;
        case "pending":
          return status === "not_friend" || status === "unknown" || status === "config_missing" || !r.verified_at;
        case "confirmed": return status === "confirmed";
        case "not_friend": return status === "not_friend";
        case "unknown": return status === "unknown" || status === "config_missing";
        case "unchecked": return !status;
        default: return true;
      }
    });
  }, [rows, q, filter, friendCache]);

  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => { setPage(0); }, [q, filter]);

  async function checkFriendsFor(ids: string[], opts?: { force?: boolean }) {
    if (!ids.length) return;
    setChecking(true);
    try {
      const force = opts?.force ?? (ids.length === 1);
      if (force) clearFriendCache(ids);
      const need = filterUncached(ids, DEFAULT_FRIEND_TTL_MS);
      const cachedHits = ids.length - need.length;
      if (need.length === 0) {
        toast.message(`ใช้ผลจากแคช ${cachedHits} รายการ (อายุไม่เกิน 5 นาที)`);
        return;
      }
      const { data, error } = await supabase.functions.invoke("admin-line-binding-friend-check", {
        body: { line_user_ids: need },
      });
      let results: FriendCache;
      if (error) {
        const reason = /forbidden/i.test(error.message) ? "forbidden"
          : /unauthorized/i.test(error.message) ? "unauthorized"
          : "internal_error";
        const now = new Date().toISOString();
        results = {};
        for (const id of need) results[id] = { status: "unknown", checked_at: now, reason };
      } else {
        results = (data?.results || {}) as FriendCache;
      }
      setFriendCache(prev => ({ ...prev, ...results }));
      setCachedFriend(results);
      const missCfg = Object.values(results).some(r => r?.reason === "config_missing" || r?.status === "config_missing");
      if (missCfg) {
        toast.error(friendReasonTH("config_missing")!);
      } else if (ids.length === 1) {
        const entry = results[ids[0]];
        if (entry?.status === "confirmed") toast.success("เป็นเพื่อน OA แล้ว");
        else {
          const msg = friendReasonTH(entry?.reason, entry?.http_status) || friendStatusLabel(entry?.status);
          entry?.status === "not_friend" ? toast.warning(msg) : toast.error(msg);
        }
      } else {
        toast.success(`ตรวจแล้ว ${Object.keys(results).length} รายการ${cachedHits ? ` (+${cachedHits} จากแคช)` : ""}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "ตรวจสถานะไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  const summary = useMemo(() => {
    let confirmed = 0, notFriend = 0, unknown = 0, unchecked = 0;
    for (const r of rows) {
      const s = friendCache[r.line_user_id]?.status;
      if (s === "confirmed") confirmed++;
      else if (s === "not_friend") notFriend++;
      else if (s === "unknown" || s === "config_missing") unknown++;
      else unchecked++;
    }
    return { total: rows.length, confirmed, notFriend, unknown, unchecked };
  }, [rows, friendCache]);

  return (
    <AdminLayout>
      <SeoHead
        title="สถานะการผูก LINE ของลูกค้า — แอดมิน"
        description="รายชื่อลูกค้าที่ผูก LINE พร้อมสถานะการเพิ่มเพื่อน OA และตัวกรองผู้ที่รอการยืนยัน"
        path="/admin/line-bindings"
      />

      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900">
            <Users className="w-6 h-6 text-primary" /> สถานะการผูก LINE ของลูกค้า
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ดูรายชื่อลูกค้าที่รอยืนยันเพื่อน OA หรือผูกไม่สำเร็จ พร้อมสถานะล่าสุดจาก LINE Messaging API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            รีเฟรชรายการ
          </Button>
          <Button
            onClick={() => void checkFriendsFor(paged.map(r => r.line_user_id))}
            disabled={checking || paged.length === 0}
            className="rounded-xl"
          >
            {checking ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            ตรวจสถานะเพื่อน (หน้านี้)
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
          <div className="text-xs text-slate-500">ทั้งหมด</div>
          <div className="text-xl font-bold text-slate-900">{summary.total}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <div className="text-xs text-emerald-700">เป็นเพื่อนแล้ว</div>
          <div className="text-xl font-bold text-emerald-800">{summary.confirmed}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <div className="text-xs text-amber-700">ยังไม่เพิ่มเพื่อน</div>
          <div className="text-xl font-bold text-amber-800">{summary.notFriend}</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
          <div className="text-xs text-rose-700">ตรวจไม่ได้</div>
          <div className="text-xl font-bold text-rose-800">{summary.unknown}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <div className="text-xs text-slate-600">ยังไม่ตรวจ</div>
          <div className="text-xl font-bold text-slate-800">{summary.unchecked}</div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ / เบอร์ / line_user_id / ชื่อลูกค้า"
          className="max-w-xs"
          aria-label="ค้นหา"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs border transition ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2">ผู้ใช้ LINE</th>
                <th className="text-left px-3 py-2">เบอร์ / ลูกค้า</th>
                <th className="text-left px-3 py-2">ผูกเมื่อ</th>
                <th className="text-left px-3 py-2">เข้าล่าสุด</th>
                <th className="text-left px-3 py-2">สถานะเพื่อน OA</th>
                <th className="text-right px-3 py-2">ตรวจซ้ำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> กำลังโหลด...
                </td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">
                  ไม่มีรายการตรงตามเงื่อนไข
                </td></tr>
              ) : paged.map(r => {
                const cache = friendCache[r.line_user_id];
                const status = (cache?.status ?? null) as FriendStatus | null;
                return (
                  <tr key={r.line_user_id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.picture_url ? (
                          <img src={r.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 grid place-items-center text-slate-500 text-xs">?</div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate max-w-[180px]">
                            {r.display_name || "(ไม่มีชื่อ)"}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono" title={r.line_user_id}>
                            {maskLineUserId(r.line_user_id)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm text-slate-900">{r.phone || "—"}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.customer_name ? `${r.customer_name} · ${r.customer_source}` : (r.customer_source || "—")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.verified_at ? relativeTimeTH(r.verified_at) : <span className="text-amber-700">ยังไม่ยืนยัน</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {relativeTimeTH(r.last_seen_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={`gap-1 border ${toneClass(friendStatusTone(status))}`} variant="outline">
                        <StatusIcon status={status} />
                        <span>{friendStatusLabel(status)}</span>
                      </Badge>
                      {status && status !== "confirmed" ? (() => {
                        const msg = friendReasonTH(cache?.reason, cache?.http_status);
                        return msg ? (
                          <div className="text-[11px] text-rose-700/90 mt-0.5 leading-tight max-w-[240px]" title={msg}>
                            {msg}
                          </div>
                        ) : null;
                      })() : null}
                      {cache?.checked_at ? (
                        <div className="text-[10px] text-slate-400 mt-0.5">ตรวจ {relativeTimeTH(cache.checked_at)}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={checking}
                        onClick={() => void checkFriendsFor([r.line_user_id], { force: true })}
                        className="h-8"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-xs text-slate-600">
            <div>หน้า {page + 1} / {pageCount} · ทั้งหมด {filtered.length} รายการ</div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                ก่อนหน้า
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>
                ถัดไป
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}