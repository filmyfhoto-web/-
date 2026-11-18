import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

/**
 * Master CRUD for `product_units`. Delete is blocked ("in-use guard") when any
 * row in `products.unit` still references the unit name — matches how the rest
 * of this app resolves units by name today.
 */

type Unit = { id: string; name: string; sort_order: number };

export default function UnitsManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_units")
      .select("id,name,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) toast.error(`โหลดหน่วยไม่สำเร็จ: ${error.message}`);
    setUnits((data ?? []) as Unit[]);
    setLoading(false);
  }
  useEffect(() => { if (open) load(); }, [open]);

  async function add() {
    const name = newName.trim();
    if (!name) return toast.error("กรุณากรอกชื่อหน่วย");
    if (units.some((u) => u.name === name)) return toast.error("ชื่อหน่วยซ้ำ");
    const { error } = await supabase.from("product_units").insert({ name, sort_order: units.length });
    if (error) {
      if (String(error.message).includes("product_units_name_key")) return toast.error("ชื่อหน่วยซ้ำในฐานข้อมูล");
      return toast.error(error.message);
    }
    setNewName("");
    load();
  }

  async function rename(u: Unit, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("ชื่อหน่วยห้ามว่าง");
    if (units.some((x) => x.id !== u.id && x.name === trimmed)) return toast.error("ชื่อหน่วยซ้ำ");
    const { error } = await supabase.from("product_units").update({ name: trimmed }).eq("id", u.id);
    if (error) return toast.error(error.message);
    load();
  }

  async function remove(u: Unit) {
    // In-use guard: products.unit stores the unit name (text), so block delete
    // when any product references it, to avoid orphan text.
    const { count, error: qe } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("unit", u.name);
    if (qe) return toast.error(qe.message);
    if ((count ?? 0) > 0) return toast.error(`ลบไม่ได้ — มีสินค้าใช้หน่วย "${u.name}" อยู่ ${count} รายการ`);
    if (!confirm(`ลบหน่วย "${u.name}"?`)) return;
    const { error } = await supabase.from("product_units").delete().eq("id", u.id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว");
    load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="units-manager">
        <DialogHeader><DialogTitle>จัดการหน่วยนับ</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="เพิ่มหน่วยใหม่ เช่น กล่อง"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            data-testid="unit-new-name"
          />
          <Button onClick={add} data-testid="unit-add-btn"><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {loading && <div className="text-xs text-muted-foreground">กำลังโหลด…</div>}
          {!loading && units.length === 0 && <div className="text-xs text-muted-foreground">ยังไม่มีหน่วยในระบบ</div>}
          {units.map((u) => (
            <div key={u.id} className="flex gap-2 items-center" data-testid={`unit-row-${u.id}`}>
              <Input
                defaultValue={u.name}
                onBlur={(e) => { if (e.target.value.trim() !== u.name) rename(u, e.target.value); }}
              />
              <Button variant="ghost" size="icon" onClick={() => remove(u)} aria-label="ลบ" data-testid={`unit-delete-${u.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}