import { useEffect, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useDebounced } from "./useDebounced";
import { tbl } from "../lib/tbl";

interface Cat {
  id: string;
  name: string;
}

export default function CategoriesList() {
  const { store } = useCurrentStore();
  const storeId = store?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Cat | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["rds_categories_list", storeId, debounced],
    enabled: !!storeId,
    queryFn: async () => {
      let q = supabase
        .from(tbl("categories") as any)
        .select("id,name")
        .eq("store_id", storeId!)
        .order("name");
      if (debounced) q = q.ilike("name", `%${debounced}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Cat[];
    },
  });

  const countsQ = useQuery({
    queryKey: ["rds_categories_counts", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("products") as any)
        .select("category_id")
        .eq("store_id", storeId!);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.category_id) map[r.category_id] = (map[r.category_id] ?? 0) + 1;
      }
      return map;
    },
  });

  useEffect(() => {
    if (!storeId) return;
    const ch = liveChannel(`cat-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tbl("categories"), filter: `store_id=eq.${storeId}` },
        () => qc.invalidateQueries({ queryKey: ["rds_categories_list", storeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId, qc]);

  function startNew() {
    setEditing(null);
    setName("");
    setOpen(true);
  }
  function startEdit(c: Cat) {
    setEditing(c);
    setName(c.name);
    setOpen(true);
  }

  async function save() {
    if (!storeId || !name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from(tbl("categories") as any)
          .update({ name: name.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("บันทึกแล้ว");
      } else {
        const { error } = await supabase
          .from(tbl("categories") as any)
          .insert({ store_id: storeId, name: name.trim() });
        if (error) throw error;
        toast.success("เพิ่มหมวดหมู่แล้ว");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["rds_categories_list", storeId] });
    } catch (e: any) {
      toast.error(e.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const count = countsQ.data?.[toDelete.id] ?? 0;
    if (count > 0) {
      toast.error(`ลบไม่ได้ มีสินค้า ${count} รายการในหมวดนี้`);
      setToDelete(null);
      return;
    }
    const { error } = await supabase.from(tbl("categories") as any).delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else toast.success("ลบแล้ว");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["rds_categories_list", storeId] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">หมวดหมู่</h1>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> เพิ่มหมวดหมู่
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="ค้นหาหมวดหมู่"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">กำลังโหลด...</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มีหมวดหมู่</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">ชื่อหมวดหมู่</th>
                <th className="py-2 text-right">จำนวนสินค้า</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data!.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 text-right">{countsQ.data?.[c.id] ?? 0}</td>
                  <td className="py-2 text-right">
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
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>ชื่อหมวดหมู่</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหมวดหมู่?</AlertDialogTitle>
            <AlertDialogDescription>
              ยืนยันการลบ "{toDelete?.name}" การลบไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}