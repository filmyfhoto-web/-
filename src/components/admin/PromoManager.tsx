import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Upload, Sparkles, ExternalLink } from "lucide-react";

const BUCKET = "product-images";

/** ISO -> ค่าใส่ใน <input type="date"> (YYYY-MM-DD) */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ค่าจาก <input type="date"> -> ISO (สิ้นสุด = สิ้นวัน) */
function fromDateInput(v: string, endOfDay = false): string | null {
  if (!v) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type Promo = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export default function PromoManager() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("shop_promos")
      .select("*")
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data as Promo[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addRow() {
    const nextSort = (rows[rows.length - 1]?.sort ?? 0) + 10;
    const { data, error } = await (supabase as any)
      .from("shop_promos")
      .insert({ title: "โปรโมชั่นใหม่", sort: nextSort, is_active: true })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setRows((r) => [...r, data as Promo]);
  }

  async function update(id: string, patch: Partial<Promo>) {
    setSaving(id);
    const { error } = await (supabase as any).from("shop_promos").update(patch).eq("id", id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function remove(id: string) {
    if (!confirm("ลบโปรโมชั่นนี้?")) return;
    const { error } = await (supabase as any).from("shop_promos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;
    const a = rows[idx];
    const b = rows[swapIdx];
    await update(a.id, { sort: b.sort });
    await update(b.id, { sort: a.sort });
    await load();
  }

  async function upload(id: string, file: File) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `promos/${id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) { toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    await update(id, { image_url: pub.publicUrl });
    toast.success("อัปโหลดรูปแล้ว");
  }

  return (
    <div className="space-y-1" data-testid="admin-promo-manager">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> โปรโมชั่นหน้าร้าน
        </h2>
        <Button onClick={addRow} className="rounded-xl">
          <Plus className="w-4 h-4 mr-1" /> เพิ่มโปรโมชั่น
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        การ์ดโปรโมชั่นจะแสดงบนหน้าแรกร้านและหน้า “บัญชีของฉัน” เฉพาะรายการที่เผยแพร่และอยู่ในช่วงวันที่ที่กำหนด (เว้นว่าง = ไม่จำกัด)
      </p>
      {loading ? (
        <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">ยังไม่มีโปรโมชั่น กด "เพิ่มโปรโมชั่น" เพื่อเริ่ม</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((p, idx) => (
            <Card key={p.id} className="p-3 space-y-2">
              <div className="flex gap-3">
                <label className="w-24 h-32 rounded-xl border border-dashed border-border bg-accent/30 grid place-items-center overflow-hidden shrink-0 cursor-pointer hover:border-primary/50">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.title || ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-[11px] text-muted-foreground p-2">
                      <Upload className="w-4 h-4 mx-auto mb-1" />
                      อัปโหลดรูป
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(p.id, f);
                    }}
                  />
                </label>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Input
                    value={p.title ?? ""}
                    placeholder="หัวข้อ"
                    onChange={(e) => setRows((r) => r.map((x) => x.id === p.id ? { ...x, title: e.target.value } : x))}
                    onBlur={(e) => update(p.id, { title: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <Input
                    value={p.subtitle ?? ""}
                    placeholder="คำอธิบายสั้น"
                    onChange={(e) => setRows((r) => r.map((x) => x.id === p.id ? { ...x, subtitle: e.target.value } : x))}
                    onBlur={(e) => update(p.id, { subtitle: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <div className="flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={p.link_url ?? ""}
                      placeholder="ลิงก์ (ถ้ามี) เช่น /shop?p=CODE หรือ https://..."
                      onChange={(e) => setRows((r) => r.map((x) => x.id === p.id ? { ...x, link_url: e.target.value } : x))}
                      onBlur={(e) => update(p.id, { link_url: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                  วันเริ่ม
                  <Input
                    type="date"
                    aria-label="วันเริ่มแสดงโปรโมชั่น"
                    value={toDateInput(p.starts_at)}
                    onChange={(e) => update(p.id, { starts_at: fromDateInput(e.target.value) })}
                    className="h-9 text-sm mt-1"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  วันสิ้นสุด
                  <Input
                    type="date"
                    aria-label="วันสิ้นสุดการแสดงโปรโมชั่น"
                    value={toDateInput(p.ends_at)}
                    onChange={(e) => update(p.id, { ends_at: fromDateInput(e.target.value, true) })}
                    className="h-9 text-sm mt-1"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.is_active}
                    aria-label="เผยแพร่โปรโมชั่นนี้"
                    onCheckedChange={(v) => update(p.id, { is_active: v })}
                    disabled={saving === p.id}
                  />
                  <span className="text-xs text-muted-foreground">
                    {p.is_active ? "เผยแพร่" : "ซ่อน"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" aria-label="เลื่อนขึ้น" className="h-8 w-8" onClick={() => move(p.id, -1)} disabled={idx === 0}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="เลื่อนลง" className="h-8 w-8" onClick={() => move(p.id, 1)} disabled={idx === rows.length - 1}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="ลบโปรโมชั่น" className="h-8 w-8 text-destructive" onClick={() => remove(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}