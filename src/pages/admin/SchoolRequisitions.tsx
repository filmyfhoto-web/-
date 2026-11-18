import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Loader2, RefreshCw, Search, Eye, AlertTriangle, Inbox, Download } from "lucide-react";
import {
  formatMoney, formatThaiDate, lineTotal, type Requisition, type RequisitionItem,
} from "@/lib/schoolRequisition";
import { downloadRequisitionPdf } from "@/lib/requisitionPdf";
import RequisitionActivity from "@/components/requisition/RequisitionActivity";

type StatusFilter = "submitted" | "draft" | "all";
type SortKey = "date_desc" | "date_asc" | "total_desc" | "total_asc" | "school_asc" | "prepared_asc";

const SORT_LABEL: Record<SortKey, string> = {
  date_desc: "วันที่ล่าสุดก่อน",
  date_asc: "วันที่เก่าสุดก่อน",
  total_desc: "ยอดรวมมาก → น้อย",
  total_asc: "ยอดรวมน้อย → มาก",
  school_asc: "ชื่อโรงเรียน ก–ฮ",
  prepared_asc: "ผู้จัดทำ ก–ฮ",
};

const STATUS_LABEL: Record<string, string> = { submitted: "ส่งแล้ว", draft: "แบบร่าง" };


function normalize(row: Record<string, unknown>): Requisition {
  const items = Array.isArray(row.items) ? (row.items as RequisitionItem[]) : [];
  return {
    id: String(row.id),
    school_name: String(row.school_name ?? ""),
    project_name: String(row.project_name ?? ""),
    prepared_by: String(row.prepared_by ?? ""),
    doc_date: String(row.doc_date ?? ""),
    status: row.status === "submitted" ? "submitted" : "draft",
    items,
    total: Number(row.total ?? 0),
    note: (row.note as string) ?? null,
    submitted_at: (row.submitted_at as string) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function PassthroughShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}


export default function AdminSchoolRequisitions({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("submitted");
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [detail, setDetail] = useState<Requisition | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("school_requisitions")
        .select("*")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") query = query.eq("status", status);
      const { data, error: err } = await query;
      if (err) throw err;
      setRows((data ?? []).map(normalize));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  // เปิดรายละเอียดตรงจากลิงก์แจ้งเตือน (?id=...)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id || rows.length === 0) return;
    const found = rows.find((r) => r.id === id);
    if (found) setDetail(found);
  }, [rows]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    const person = who.trim().toLowerCase();
    const dateOf = (r: Requisition) => (r.submitted_at || r.created_at || "").slice(0, 10) || r.doc_date;
    const list = rows.filter((r) => {
      if (key) {
        const hay = `${r.school_name} ${r.project_name} ${r.prepared_by}`.toLowerCase();
        if (!hay.includes(key)) return false;
      }
      if (person) {
        const hay = `${r.prepared_by} ${r.project_name}`.toLowerCase();
        if (!hay.includes(person)) return false;
      }
      const d = dateOf(r);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
    const th = (a: string, b: string) => a.localeCompare(b, "th");
    return list.sort((a, b) => {
      switch (sort) {
        case "date_asc": return dateOf(a).localeCompare(dateOf(b));
        case "total_desc": return b.total - a.total;
        case "total_asc": return a.total - b.total;
        case "school_asc": return th(a.school_name, b.school_name);
        case "prepared_asc": return th(a.prepared_by, b.prepared_by);
        default: return dateOf(b).localeCompare(dateOf(a));
      }
    });
  }, [rows, q, who, from, to, sort]);


  const submittedCount = rows.filter((r) => r.status === "submitted").length;

  // ต้องเป็น identity คงที่ ไม่งั้น React จะ unmount/remount ทุกครั้งที่ render (โฟกัสหลุด)
  const Shell = embedded ? PassthroughShell : AdminLayout;


  return (
    <Shell>
      <div className={embedded ? "w-full space-y-4" : "mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-5"}>
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold sm:text-xl">ใบเขียนเบิก</h1>
            <p className="text-xs text-muted-foreground">
              NATTA GROUP · ใบเขียนเบิกที่ลูกค้าส่งเข้ามา — เอกสารประมาณการ ไม่ตัดสต๊อก
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">ส่งแล้ว {submittedCount} รายการ</Badge>
          <Button size="sm" asChild>
            <a href="/admin/school-requisitions">ใบเบิกสินค้า</a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            รีเฟรช
          </Button>
        </header>

        <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="ค้นหาโรงเรียน / โครงการ / ผู้จัดทำ"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="ค้นหาใบเขียนเบิก"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-12 shrink-0 text-xs text-muted-foreground" htmlFor="req-from">ตั้งแต่</label>
            <Input id="req-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-12 shrink-0 text-xs text-muted-foreground" htmlFor="req-to">ถึง</label>
            <Input id="req-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {(["submitted", "draft", "all"] as StatusFilter[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                className="flex-1"
                onClick={() => setStatus(s)}
              >
                {s === "all" ? "ทั้งหมด" : STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          <Input
            placeholder="กรองผู้จัดทำ / โครงการ"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            aria-label="กรองตามผู้จัดทำหรือโครงการ"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger aria-label="จัดเรียงรายการ">
              <SelectValue placeholder="จัดเรียง" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">โหลดรายการไม่สำเร็จ</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()}>ลองใหม่</Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">ยังไม่มีใบเขียนเบิก</p>
            <p className="text-xs text-muted-foreground">เมื่อลูกค้ากด “ส่งรายการให้ร้าน” รายการจะแสดงที่นี่ทันที</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">วันที่ส่ง</th>
                    <th className="px-3 py-2 text-left font-medium">โรงเรียน / หน่วยงาน</th>
                    <th className="px-3 py-2 text-left font-medium">โครงการ</th>
                    <th className="px-3 py-2 text-left font-medium">ผู้จัดทำ</th>
                    <th className="px-3 py-2 text-right font-medium">รายการ</th>
                    <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatThaiDate((r.submitted_at || r.created_at || "").slice(0, 10) || r.doc_date)}
                      </td>
                      <td className="px-3 py-2 font-medium">{r.school_name || "—"}</td>
                      <td className="px-3 py-2">{r.project_name || "—"}</td>
                      <td className="px-3 py-2">{r.prepared_by || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.items.length}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatMoney(r.total)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === "submitted" ? "default" : "secondary"}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setDetail(r)}>
                            <Eye className="mr-1.5 h-4 w-4" />ดูรายละเอียด
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`ดาวน์โหลด PDF ${r.school_name}`}
                            onClick={() => downloadRequisitionPdf(r)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {filtered.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.school_name || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.project_name || "—"}</p>
                    </div>
                    <Badge variant={r.status === "submitted" ? "default" : "secondary"}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <div>วันที่ส่ง: {formatThaiDate((r.submitted_at || r.created_at || "").slice(0, 10) || r.doc_date)}</div>
                    <div>ผู้จัดทำ: {r.prepared_by || "—"}</div>
                    <div>จำนวน: {r.items.length} รายการ</div>
                    <div className="text-right font-semibold text-foreground">{formatMoney(r.total)} บาท</div>
                  </dl>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetail(r)}>
                      <Eye className="mr-1.5 h-4 w-4" />ดูรายละเอียด
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadRequisitionPdf(r)}>
                      <Download className="mr-1.5 h-4 w-4" />PDF
                    </Button>
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ใบเขียนเบิก — {detail?.school_name || "—"}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Badge variant="secondary" className="text-[11px]">เอกสารประมาณการ · ไม่ตัดสต๊อก</Badge>
              <div className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>โครงการ: <b className="text-foreground">{detail.project_name || "—"}</b></div>
                <div>ผู้จัดทำ: <b className="text-foreground">{detail.prepared_by || "—"}</b></div>
                <div>วันที่เอกสาร: <b className="text-foreground">{formatThaiDate(detail.doc_date)}</b></div>
                <div>
                  วันที่ส่ง:{" "}
                  <b className="text-foreground">
                    {formatThaiDate((detail.submitted_at || detail.created_at || "").slice(0, 10))}
                  </b>
                </div>
                {detail.note ? <div className="sm:col-span-2">หมายเหตุ: {detail.note}</div> : null}
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">ลำดับ</th>
                      <th className="px-2 py-2 text-left font-medium">รายการสินค้า</th>
                      <th className="px-2 py-2 text-right font-medium">ราคา/หน่วย</th>
                      <th className="px-2 py-2 text-right font-medium">จำนวน</th>
                      <th className="px-2 py-2 text-left font-medium">หน่วย</th>
                      <th className="px-2 py-2 text-right font-medium">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it, i) => (
                      <tr key={it.id || i} className="border-t">
                        <td className="px-2 py-1.5">{i + 1}</td>
                        <td className="px-2 py-1.5">
                          {it.name}
                          {it.code ? <span className="ml-1 text-xs text-muted-foreground">({it.code})</span> : null}
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatMoney(it.price)}</td>
                        <td className="px-2 py-1.5 text-right">{it.qty}</td>
                        <td className="px-2 py-1.5">{it.unit}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatMoney(lineTotal(it))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <span className="text-sm text-muted-foreground">{detail.items.length} รายการ</span>
                <span className="text-lg font-bold">{formatMoney(detail.total)} บาท</span>
              </div>
              <Button variant="outline" className="w-full" onClick={() => downloadRequisitionPdf(detail)}>
                <Download className="mr-1.5 h-4 w-4" /> ดาวน์โหลด PDF
              </Button>
              <RequisitionActivity requisitionId={detail.id} />
            </div>
          )}

        </DialogContent>
      </Dialog>
    </Shell>
  );
}
