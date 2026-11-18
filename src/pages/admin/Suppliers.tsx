import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Truck, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  note: string | null;
  created_at: string;
};

const empty = { name: "", phone: "", address: "", tax_id: "", note: "" };

export default function AdminSuppliers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("suppliers" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as any);
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(r: Supplier) {
    setEditing(r);
    setForm({
      name: r.name ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      tax_id: r.tax_id ?? "",
      note: r.note ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("กรุณากรอกชื่อผู้จำหน่าย"); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        tax_id: form.tax_id.trim() || null,
        note: form.note.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("suppliers" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("บันทึกแล้ว");
      } else {
        const { error } = await supabase.from("suppliers" as any).insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
        toast.success("เพิ่มผู้จำหน่ายแล้ว");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function del(r: Supplier) {
    if (!confirm(`ลบผู้จำหน่าย "${r.name}"?`)) return;
    const { error } = await supabase.from("suppliers" as any).delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว");
    load();
  }

  const filtered = rows.filter(r =>
    !q.trim() ||
    r.name.toLowerCase().includes(q.toLowerCase()) ||
    (r.phone ?? "").includes(q) ||
    (r.tax_id ?? "").includes(q)
  );

  return (
    <AdminLayout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" /> ผู้จำหน่าย / Supplier
        </h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl bg-gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-1" /> เพิ่มผู้จำหน่าย
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "แก้ไขผู้จำหน่าย" : "ผู้จำหน่ายใหม่"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">ชื่อผู้จำหน่าย *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="rounded-xl mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">เบอร์โทร</label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="rounded-xl mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">เลขผู้เสียภาษี</label>
                  <Input value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} className="rounded-xl mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ที่อยู่</label>
                <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="rounded-xl mt-1" rows={2} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">หมายเหตุ</label>
                <Textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="rounded-xl mt-1" rows={2} />
              </div>
              <Button onClick={save} disabled={busy} className="w-full rounded-xl bg-gradient-primary text-primary-foreground">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ค้นหาชื่อ / เบอร์ / เลขภาษี" value={q} onChange={e => setQ(e.target.value)} className="pl-9 rounded-xl" />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-card rounded-2xl p-12 text-center border border-border text-muted-foreground">
            ยังไม่มีผู้จำหน่าย
          </div>
        ) : filtered.map(r => (
          <div key={r.id} className="bg-card rounded-2xl border border-border p-4 flex flex-wrap gap-3 items-start justify-between shadow-card">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground">{r.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                {r.phone && <span>โทร: {r.phone}</span>}
                {r.tax_id && <span>เลขภาษี: {r.tax_id}</span>}
              </div>
              {r.address && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{r.address}</div>}
              {r.note && <div className="text-xs text-muted-foreground/80 mt-1 italic">{r.note}</div>}
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(r)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}