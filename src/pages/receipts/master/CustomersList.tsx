import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Merge, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useDebounced } from "./useDebounced";
import { tbl, rpc, useTablePrefix } from "../lib/tbl";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  branch_name: string | null;
}

const EMPTY: Omit<Customer, "id"> = {
  name: "",
  phone: "",
  email: "",
  address: "",
  tax_id: "",
  branch_name: "",
};

export default function CustomersList() {
  const { store } = useCurrentStore();
  const storeId = store?.id;
  const prefix = useTablePrefix();
  const isFilm = prefix === "film";
  // film_customers has no store_id / branch_name columns — query the whole
  // shared film customer directory instead of scoping by store.
  const selectCols = isFilm
    ? "id,name,phone,email,address,tax_id"
    : "id,name,phone,email,address,tax_id,branch_name";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Omit<Customer, "id">>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [dupCandidates, setDupCandidates] = useState<Customer[]>([]);
  const [confirmDupSave, setConfirmDupSave] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<Customer | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [`${prefix}_customers_list`, storeId, debounced],
    enabled: isFilm ? true : !!storeId,
    queryFn: async () => {
      let q = supabase
        .from(tbl("customers") as any)
        .select(selectCols)
        .order("name")
        .limit(500);
      if (!isFilm) q = q.eq("store_id", storeId!);
      if (debounced) {
        q = q.or(
          `name.ilike.%${debounced}%,phone.ilike.%${debounced}%,tax_id.ilike.%${debounced}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  useEffect(() => {
    if (!isFilm && !storeId) return;
    const ch = liveChannel(`cust-${prefix}-${storeId ?? "all"}`)
      .on(
        "postgres_changes",
        isFilm
          ? { event: "*", schema: "public", table: tbl("customers") }
          : { event: "*", schema: "public", table: tbl("customers"), filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: [`${prefix}_customers_list`, storeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId, qc, isFilm, prefix]);

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setDupCandidates([]);
    setConfirmDupSave(false);
    setOpen(true);
  }
  function startEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      address: c.address ?? "",
      tax_id: c.tax_id ?? "",
      branch_name: c.branch_name ?? "",
    });
    setDupCandidates([]);
    setConfirmDupSave(false);
    setOpen(true);
  }

  async function save() {
    if ((!isFilm && !storeId) || !form.name.trim()) {
      toast.error("กรุณากรอกชื่อลูกค้า");
      return;
    }
    const nameTrim = form.name.trim();
    if (!confirmDupSave) {
      let dupQ = supabase
        .from(tbl("customers") as any)
        .select(selectCols)
        .ilike("name", `%${nameTrim}%`)
        .limit(10);
      if (!isFilm) dupQ = dupQ.eq("store_id", storeId!);
      const { data: similar } = await dupQ;
      const list = ((similar ?? []) as unknown as Customer[]).filter((c) => c.id !== editing?.id);
      if (list.length > 0) {
        setDupCandidates(list);
        toast.warning("พบลูกค้าชื่อคล้ายกัน — โปรดตรวจสอบก่อนบันทึก");
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: nameTrim,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        tax_id: form.tax_id || null,
      };
      if (!isFilm) payload.branch_name = form.branch_name || null;
      if (editing) {
        const { error } = await supabase
          .from(tbl("customers") as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("บันทึกแล้ว");
      } else {
        const insertPayload = isFilm ? payload : { ...payload, store_id: storeId };
        const { error } = await supabase
          .from(tbl("customers") as any)
          .insert(insertPayload);
        if (error) throw error;
        toast.success("เพิ่มลูกค้าแล้ว");
      }
      setOpen(false);
      setDupCandidates([]);
      setConfirmDupSave(false);
      qc.invalidateQueries({ queryKey: [`${prefix}_customers_list`, storeId] });
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function doMerge() {
    if (!mergeSource || !mergeTargetId || mergeTargetId === mergeSource.id) {
      toast.error("เลือกลูกค้าปลายทาง"); return;
    }
    setMerging(true);
    try {
      const { data, error } = await supabase.rpc(tbl("merge_customers") as any, {
        p_target: mergeTargetId, p_source: mergeSource.id,
      });
      if (error) throw error;
      const moved = (data as any)?.documents_moved ?? 0;
      toast.success(`รวมลูกค้าแล้ว — ย้ายเอกสาร ${moved} ใบ`);
      setMergeOpen(false); setMergeSource(null); setMergeTargetId("");
      qc.invalidateQueries({ queryKey: [`${prefix}_customers_list`, storeId] });
    } catch (e: any) {
      toast.error(e.message ?? "รวมไม่สำเร็จ");
    } finally { setMerging(false); }
  }

  function openMerge(c: Customer) {
    setMergeSource(c); setMergeTargetId(""); setMergeOpen(true);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const { error } = await supabase.from(tbl("customers") as any).delete().eq("id", toDelete.id);
    if (error) {
      toast.error(`ลบไม่สำเร็จ: ${error.message}`);
    } else {
      toast.success("ลบลูกค้าแล้ว — เอกสารเดิมยังอยู่ครบ (ชื่อในใบยังคงเดิม)");
    }
    setToDelete(null);
    qc.invalidateQueries({ queryKey: [`${prefix}_customers_list`, storeId] });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">ลูกค้า</h1>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> เพิ่มลูกค้า
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="ค้นหา ชื่อ / เบอร์ / เลขผู้เสียภาษี"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">กำลังโหลด...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีลูกค้า</p>
        ) : (
          <>
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-border">
            {data!.map((c) => (
              <div key={c.id} className="py-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone || "—"}{c.branch_name ? ` · ${c.branch_name}` : ""}</div>
                    {c.tax_id && <div className="text-xs text-muted-foreground">TAX: {c.tax_id}</div>}
                  </div>
                  <div className="flex shrink-0">
                    <Button size="sm" variant="ghost" title="รวมลูกค้าซ้ำ" onClick={() => openMerge(c)}><Merge className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">ชื่อ</th>
                  <th className="py-2 pr-3">เบอร์โทร</th>
                  <th className="py-2 pr-3">เลขผู้เสียภาษี</th>
                  <th className="py-2 pr-3">สาขา</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data!.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{c.name}</td>
                    <td className="py-2 pr-3">{c.phone || "-"}</td>
                    <td className="py-2 pr-3">{c.tax_id || "-"}</td>
                    <td className="py-2 pr-3">{c.branch_name || "-"}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" title="รวมลูกค้าซ้ำ" onClick={() => openMerge(c)}>
                        <Merge className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setToDelete(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 space-y-1">
              <Label>ชื่อ *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>เบอร์โทร</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>อีเมล</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>เลขผู้เสียภาษี</Label>
              <Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>สาขา</Label>
              <Input value={form.branch_name ?? ""} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label>ที่อยู่</Label>
              <Textarea
                rows={3}
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>
              {dupCandidates.length > 0 && confirmDupSave ? "บันทึกซ้ำชื่อ" : "บันทึก"}
            </Button>
          </DialogFooter>
          {dupCandidates.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> พบลูกค้าชื่อคล้ายกัน ({dupCandidates.length})
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {dupCandidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-1">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.phone, c.tax_id, c.branch_name].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { setOpen(false); startEdit(c); }}>
                      ใช้รายชื่อนี้
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => {
                  setConfirmDupSave(true);
                  toast.info('กดปุ่ม "บันทึกซ้ำชื่อ" เพื่อยืนยัน');
                }}>
                  สร้างใหม่อยู่ดี (ชื่อซ้ำ)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบลูกค้า "{toDelete?.name}" ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
                  ✓ ใบเอกสารเดิมทั้งหมด <b>จะยังอยู่ครบ</b> ไม่ถูกลบตาม
                </div>
                <div>
                  ชื่อ/ที่อยู่/เลขผู้เสียภาษีในใบเป็น <b>snapshot</b> ที่บันทึกตอนออกใบ —
                  พิมพ์ซ้ำได้เหมือนเดิม เพียงแต่ใบจะถูกปลดลิงก์ออกจากรายชื่อลูกค้านี้
                </div>
                <div className="text-muted-foreground">
                  หากต้องการ <b>รวม</b> ลูกค้าซ้ำเข้าด้วยกันแทนการลบ ให้ใช้ปุ่ม
                  <span className="inline-flex items-center gap-1 mx-1"><Merge className="h-3 w-3" />รวมลูกค้า</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>ลบลูกค้า (เก็บใบเอกสารไว้)</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>รวมลูกค้าซ้ำ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted p-2">
              <div className="text-xs text-muted-foreground">ต้นทาง (จะถูกลบหลังย้ายเอกสาร)</div>
              <div className="font-medium">{mergeSource?.name}</div>
              <div className="text-xs text-muted-foreground">
                {[mergeSource?.phone, mergeSource?.tax_id].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <MergeTargetPicker
              storeId={storeId}
              excludeId={mergeSource?.id}
              defaultName={mergeSource?.name ?? ""}
              value={mergeTargetId}
              onChange={setMergeTargetId}
            />
            <div className="text-xs text-muted-foreground">
              เอกสารทุกใบของต้นทางจะถูกย้ายมาผูกกับลูกค้าปลายทาง
              และข้อมูลที่ปลายทางว่างจะถูกเติมจากต้นทางอัตโนมัติ
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>ยกเลิก</Button>
            <Button onClick={doMerge} disabled={merging || !mergeTargetId}>รวมลูกค้า</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MergeTargetPicker({
  storeId, excludeId, defaultName, value, onChange,
}: {
  storeId: string | undefined;
  excludeId: string | undefined;
  defaultName: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const prefix = useTablePrefix();
  const isFilm = prefix === "film";
  const [q, setQ] = useState(defaultName);
  const debounced = useDebounced(q);
  const { data } = useQuery({
    queryKey: ["merge_target", prefix, storeId, debounced, excludeId],
    enabled: isFilm ? true : !!storeId,
    queryFn: async () => {
      let qry = supabase
        .from(tbl("customers") as any)
        .select("id,name,phone,tax_id")
        .order("name")
        .limit(20);
      if (!isFilm) qry = qry.eq("store_id", storeId!);
      if (debounced) qry = qry.ilike("name", `%${debounced}%`);
      const { data } = await qry;
      return ((data ?? []) as any[]).filter((c) => c.id !== excludeId) as Customer[];
    },
  });
  return (
    <div className="space-y-1">
      <Label>ลูกค้าปลายทาง (จะเก็บไว้)</Label>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ" />
      <div className="max-h-48 overflow-y-auto rounded-md border">
        {(data ?? []).length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">ไม่พบ</div>
        ) : (
          (data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              className={`w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${value === c.id ? "bg-accent" : ""}`}
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {[c.phone, c.tax_id].filter(Boolean).join(" · ") || "—"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}