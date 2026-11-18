import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Eye, RefreshCw, Search, User2, UserX, Phone, ExternalLink } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Link } from "react-router-dom";

type Row = {
  id: string;
  session_id: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  path: string | null;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  line_user_id: string | null;
  full_name: string | null;
  ip: string | null;
  device: string | null;
  browser: string | null;
  source: string | null;
  referrer: string | null;
  view_count: number;
  first_at: string;
  last_at: string;
};

type Stats = {
  clicks: number;
  sessions: number;
  identified_sessions: number;
  anon_sessions: number;
  products_viewed: number;
};

const PAGE = 100;

function isIdentified(r: Row) {
  return !!(r.user_id || r.guest_phone || r.line_user_id);
}

function displayName(r: Row) {
  if (r.full_name) return r.full_name;
  if (r.guest_name) return r.guest_name;
  if (r.guest_phone) return r.guest_phone;
  if (r.line_user_id) return `LINE: ${r.line_user_id.slice(0, 8)}…`;
  return "ผู้เยี่ยมชมไม่ระบุตัวตน";
}

export default function AdminProductViews() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [identified, setIdentified] = useState<"all" | "identified" | "anon">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const [customer, setCustomer] = useState<Row | null>(null);
  const [customerRows, setCustomerRows] = useState<any[]>([]);

  const fromISO = useMemo(() => (from ? new Date(from + "T00:00:00").toISOString() : null), [from]);
  const toISO = useMemo(() => (to ? new Date(to + "T23:59:59.999").toISOString() : null), [to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: rowsData, error: e1 }, { data: statsData, error: e2 }] = await Promise.all([
        supabase.rpc("admin_list_product_views", {
          p_q: q,
          p_from: fromISO,
          p_to: toISO,
          p_identified: identified,
          p_limit: PAGE,
          p_offset: page * PAGE,
        }),
        supabase.rpc("admin_product_view_stats", {
          p_from: fromISO, p_to: toISO,
        }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setRows((rowsData as Row[]) || []);
      setStats((statsData as any) || null);
    } catch (e: any) {
      toast.error(e?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [q, fromISO, toISO, identified, page]);

  useEffect(() => { load(); }, [load]);

  async function openCustomer(r: Row) {
    setCustomer(r);
    setCustomerRows([]);
    try {
      const { data, error } = await supabase.rpc("admin_customer_view_history", {
        p_user_id: r.user_id,
        p_phone: r.guest_phone,
        p_line_user_id: r.line_user_id,
        p_limit: 200,
      });
      if (error) throw error;
      setCustomerRows((data as any[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "โหลดประวัติลูกค้าไม่สำเร็จ");
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Eye className="w-5 h-5" /> ประวัติการเข้าชมสินค้า</h1>
            <p className="text-sm text-muted-foreground">
              บันทึกอัตโนมัติเมื่อลูกค้าเปิดดูสินค้า — ข้อมูลจากระบบเท่านั้น ไม่มีการเดา
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["จำนวนครั้งที่กดดู", stats?.clicks ?? 0],
            ["ผู้เข้าชม (session)", stats?.sessions ?? 0],
            ["ระบุตัวตนได้", stats?.identified_sessions ?? 0],
            ["ไม่ระบุตัวตน", stats?.anon_sessions ?? 0],
            ["สินค้าที่ถูกดู", stats?.products_viewed ?? 0],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-2xl border border-border bg-card p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="text-lg font-bold">{val as number}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-3 grid gap-2 md:grid-cols-[1fr_160px_160px_180px_auto]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setPage(0); setQ(e.target.value); }}
              placeholder="ค้นหา: ชื่อ/รหัสสินค้า, ชื่อลูกค้า, เบอร์โทร"
              className="pl-8 rounded-xl"
            />
          </div>
          <Input type="date" value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} className="rounded-xl" />
          <Input type="date" value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} className="rounded-xl" />
          <Select value={identified} onValueChange={(v) => { setPage(0); setIdentified(v as any); }}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="identified">เฉพาะที่ระบุตัวตนได้</SelectItem>
              <SelectItem value="anon">เฉพาะผู้ไม่ระบุตัวตน</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-xl" onClick={() => { setQ(""); setFrom(""); setTo(""); setIdentified("all"); setPage(0); }}>
            ล้าง
          </Button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">เวลา</th>
                <th className="text-left p-2">สินค้า</th>
                <th className="text-left p-2">ลูกค้า</th>
                <th className="text-left p-2">ที่มา</th>
                <th className="text-left p-2">อุปกรณ์</th>
                <th className="text-right p-2">ครั้ง</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                  <td className="p-2 whitespace-nowrap text-xs">
                    <div>{fmtDateTime(r.last_at)}</div>
                    {r.first_at !== r.last_at && (
                      <div className="text-[10px] text-muted-foreground">เริ่ม: {fmtDateTime(r.first_at)}</div>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.product_name || "(ถูกลบแล้ว)"}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>{r.product_code || "—"}</span>
                      {r.path && (
                        <Link to={r.path} className="inline-flex items-center gap-0.5 hover:text-primary">
                          เปิดหน้าสินค้า <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1 text-sm">
                      {isIdentified(r) ? <User2 className="w-3.5 h-3.5 text-primary" /> : <UserX className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className={isIdentified(r) ? "font-medium" : "text-muted-foreground"}>{displayName(r)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                      {r.guest_phone && <span className="inline-flex items-center gap-0.5"><Phone className="w-3 h-3" />{r.guest_phone}</span>}
                      {r.line_user_id && <span>LINE ✓</span>}
                      {r.ip && <span className="font-mono">{r.ip}</span>}
                    </div>
                  </td>
                  <td className="p-2 text-xs">
                    <Badge variant="outline" className="rounded-md">{r.source || "—"}</Badge>
                    {r.referrer && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{r.referrer}</div>}
                  </td>
                  <td className="p-2 text-xs">
                    <div>{r.device || "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{r.browser || ""}</div>
                  </td>
                  <td className="p-2 text-right font-bold">{r.view_count}</td>
                  <td className="p-2">
                    {isIdentified(r) && (
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => openCustomer(r)}>
                        ดูลูกค้า
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.product_name || "(ถูกลบแล้ว)"}</div>
                  <div className="text-[11px] text-muted-foreground">{r.product_code || "—"} · {fmtDateTime(r.last_at)}</div>
                </div>
                <Badge variant="outline" className="rounded-md text-[10px]">{r.view_count} ครั้ง</Badge>
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm">
                {isIdentified(r) ? <User2 className="w-3.5 h-3.5 text-primary" /> : <UserX className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className={isIdentified(r) ? "font-medium" : "text-muted-foreground"}>{displayName(r)}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                {r.device && <span>{r.device}</span>}
                {r.browser && <span>· {r.browser}</span>}
                {r.source && <span>· {r.source}</span>}
              </div>
              {isIdentified(r) && (
                <Button size="sm" variant="outline" className="rounded-lg mt-2 w-full" onClick={() => openCustomer(r)}>
                  ดูประวัติของลูกค้าคนนี้
                </Button>
              )}
            </div>
          ))}
          {!rows.length && !loading && (
            <div className="text-center text-sm text-muted-foreground p-6">ยังไม่มีข้อมูล</div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">หน้า {page + 1} · แสดงสูงสุด {PAGE} รายการ/หน้า</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
            <Button size="sm" variant="outline" disabled={rows.length < PAGE || loading} onClick={() => setPage(page + 1)}>ถัดไป</Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          * ระบบเก็บข้อมูลย้อนหลังไม่เกิน 180 วัน (ลบอัตโนมัติ) · ข้อมูลบันทึกจริงจากเบราว์เซอร์ผู้ใช้เท่านั้น
        </p>
      </div>

      <Dialog open={!!customer} onOpenChange={(o) => !o && setCustomer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User2 className="w-4 h-4" /> {customer ? displayName(customer) : ""}
            </DialogTitle>
          </DialogHeader>
          {customer && (
            <div className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-3">
              {customer.guest_phone && <span><Phone className="w-3 h-3 inline mr-1" />{customer.guest_phone}</span>}
              {customer.line_user_id && <span>LINE ID: {customer.line_user_id}</span>}
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left p-2">เวลาล่าสุด</th>
                  <th className="text-left p-2">สินค้า</th>
                  <th className="text-right p-2">ครั้ง</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{fmtDateTime(r.last_at)}</td>
                    <td className="p-2">
                      <div className="font-medium">{r.product_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{r.product_code || ""}</div>
                    </td>
                    <td className="p-2 text-right">{r.view_count}</td>
                  </tr>
                ))}
                {!customerRows.length && (
                  <tr><td colSpan={3} className="p-6 text-center text-sm text-muted-foreground">ไม่มีประวัติ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}