import AdminLayout from "@/components/layout/AdminLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Users, Tag } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { ListChecks } from "lucide-react";
import { useBulkSelect } from "@/hooks/useBulkSelect";
import BulkActionBar from "@/components/BulkActionBar";

type Group = { id: string; name: string; markup_percent: number; is_custom: boolean; sort_order: number };

export default function AdminPriceGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Group> | null>(null);
  const bulk = useBulkSelect(groups);

  async function load() {
    const { data } = await supabase.from("price_groups").select("*").order("sort_order").order("name");
    const gs = (data as Group[]) ?? [];
    setGroups(gs);
    const { data: orgs } = await supabase.from("organizations").select("price_group_id");
    const c: Record<string, number> = {};
    for (const o of orgs ?? []) {
      const gid = (o as any).price_group_id; if (!gid) continue;
      c[gid] = (c[gid] ?? 0) + 1;
    }
    setCounts(c);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing({ name: "", markup_percent: 0, is_custom: false, sort_order: (groups.at(-1)?.sort_order ?? 0) + 10 }); setOpen(true); }
  function openEdit(g: Group) { setEditing(g); setOpen(true); }

  async function save() {
    if (!editing?.name?.trim()) return toast.error("กรอกชื่อกลุ่ม");
    const payload = {
      name: editing.name.trim(),
      markup_percent: Number(editing.markup_percent) || 0,
      is_custom: !!editing.is_custom,
      sort_order: Number(editing.sort_order) || 0,
    };
    if (editing.id) {
      const { error } = await supabase.from("price_groups").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("price_groups").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("บันทึกแล้ว"); setOpen(false); setEditing(null); load();
  }

  async function remove(g: Group) {
    if ((counts[g.id] ?? 0) > 0) return toast.error("ยังมีลูกค้าในกลุ่มนี้ ย้ายออกก่อน");
    if (!confirm(`ลบกลุ่ม "${g.name}"?`)) return;
    const { error } = await supabase.from("price_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว"); load();
  }

  async function bulkDelete() {
    const ids = bulk.selectedArray; if (!ids.length) return;
    const blocked = ids.filter(id => (counts[id] ?? 0) > 0);
    if (blocked.length) return toast.error(`มี ${blocked.length} กลุ่มที่ยังมีลูกค้า — ย้ายออกก่อน`);
    const { error } = await supabase.from("price_groups").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`ลบ ${ids.length} กลุ่ม`); bulk.exit(); load();
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="w-6 h-6 text-primary" /> กลุ่มราคา</h1>
          <p className="text-sm text-muted-foreground mt-1">กำหนดเปอร์เซ็นต์กำไรของแต่ละกลุ่ม ลูกค้าจะเห็นราคาตามกลุ่มของตัวเอง</p>
        </div>
        <div className="flex gap-2">
          <Button variant={bulk.selectMode ? "default" : "outline"} className="rounded-xl" onClick={() => bulk.selectMode ? bulk.exit() : bulk.setSelectMode(true)}>
            <ListChecks className="w-4 h-4 mr-1" /> {bulk.selectMode ? "ออกจากโหมดเลือก" : "เลือกหลายรายการ"}
          </Button>
          <Button onClick={openNew} className="rounded-xl bg-primary text-primary-foreground"><Plus className="w-4 h-4 mr-1" />เพิ่มกลุ่มราคา</Button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-accent/60 text-xs">
            <tr>
              {bulk.selectMode && <th className="p-3 w-10"><Checkbox checked={bulk.allSelected} onCheckedChange={() => bulk.toggleAll()} /></th>}
              <th className="text-left p-3">ลำดับ</th>
              <th className="text-left p-3">ชื่อกลุ่ม</th>
              <th className="text-right p-3">เปอร์เซ็นต์กำไร</th>
              <th className="text-center p-3">ราคากำหนดเอง</th>
              <th className="text-right p-3">จำนวนลูกค้า</th>
              <th className="text-right p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id} className="border-t border-border">
                {bulk.selectMode && <td className="p-3"><Checkbox checked={bulk.ids.has(g.id)} onCheckedChange={() => bulk.toggle(g.id)} /></td>}
                <td className="p-3 text-xs">{g.sort_order}</td>
                <td className="p-3 font-medium">{g.name}</td>
                <td className="p-3 text-right">{g.is_custom ? <Badge variant="outline">กำหนดเอง</Badge> : `+${Number(g.markup_percent)}%`}</td>
                <td className="p-3 text-center">{g.is_custom ? <Badge className="bg-secondary text-secondary-foreground">ใช่</Badge> : "—"}</td>
                <td className="p-3 text-right"><span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-muted-foreground" />{counts[g.id] ?? 0}</span></td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(g)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(g)}><Trash2 className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">ยังไม่มีกลุ่มราคา</td></tr>}
          </tbody>
        </table>
      </div>
      {bulk.selectMode && bulk.count > 0 && (
        <BulkActionBar count={bulk.count} onCancel={bulk.exit} onConfirm={() => { void bulkDelete(); }}
          itemLabel="กลุ่มราคา"
          previewNames={bulk.selectedArray.map(id => (groups.find((x: any) => x.id === id) as any)?.name).filter(Boolean) as string[]}
          confirmDescription={`ลบกลุ่มราคา ${bulk.count} รายการ`} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "แก้ไขกลุ่มราคา" : "เพิ่มกลุ่มราคา"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>ชื่อกลุ่ม</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="rounded-xl mt-1" /></div>
            <div><Label>เปอร์เซ็นต์กำไร (%)</Label><Input type="number" step="0.01" value={editing?.markup_percent ?? 0} disabled={!!editing?.is_custom} onChange={(e) => setEditing({ ...editing, markup_percent: Number(e.target.value) })} className="rounded-xl mt-1" /></div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <div className="text-sm font-medium">ราคากำหนดเอง</div>
                <div className="text-xs text-muted-foreground">ไม่ใช้สูตร — ต้องตั้งราคาแต่ละสินค้าให้ลูกค้าโดยตรง</div>
              </div>
              <Switch checked={!!editing?.is_custom} onCheckedChange={(v) => setEditing({ ...editing, is_custom: v })} />
            </div>
            <div><Label>ลำดับการแสดง</Label><Input type="number" value={editing?.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} className="rounded-xl mt-1" /></div>
            <Button onClick={save} className="w-full rounded-xl bg-primary text-primary-foreground">บันทึก</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
