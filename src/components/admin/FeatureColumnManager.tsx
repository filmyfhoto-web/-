import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  AUTO_SOURCE_LABEL, FEATURE_ICON_NAMES, TONE_LABEL, TONE_TOKEN, resolveFeatureIcon, toneToken,
  type FeatureAutoSource, type FeatureColumnRow, type FeatureItemRow, type FeatureTone,
} from "@/lib/shopFeatureColumns";

const TONES = Object.keys(TONE_TOKEN) as FeatureTone[];
const SOURCES = Object.keys(AUTO_SOURCE_LABEL) as FeatureAutoSource[];

/** จัดการ “เมนูพิเศษ” 3 คอลัมน์บนหน้าแรกลูกค้า — เพิ่ม/ลบ/แก้/เรียง/เปิดปิด */
export default function FeatureColumnManager() {
  const [columns, setColumns] = useState<FeatureColumnRow[]>([]);
  const [items, setItems] = useState<FeatureItemRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      (supabase as any).from("shop_feature_columns").select("*").order("sort_order", { ascending: true }),
      (supabase as any).from("shop_feature_items").select("*").order("sort_order", { ascending: true }),
    ]);
    setColumns((c.data as FeatureColumnRow[]) ?? []);
    setItems((i.data as FeatureItemRow[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function patchColumn(id: string, patch: Partial<FeatureColumnRow>) {
    setColumns((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("shop_feature_columns").update(patch).eq("id", id);
    if (error) toast.error(error.message || "บันทึกไม่สำเร็จ");
  }

  async function patchItem(id: string, patch: Partial<FeatureItemRow>) {
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await (supabase as any).from("shop_feature_items").update(patch).eq("id", id);
    if (error) toast.error(error.message || "บันทึกไม่สำเร็จ");
  }

  async function addColumn() {
    setBusy(true);
    const { error } = await (supabase as any).from("shop_feature_columns").insert({
      key: `col-${Date.now().toString(36)}`,
      title: "คอลัมน์ใหม่",
      tone: "blue",
      icon_name: "Star",
      auto_source: "none",
      sort_order: columns.length,
    });
    setBusy(false);
    if (error) toast.error(error.message || "เพิ่มไม่สำเร็จ");
    else { toast.success("เพิ่มคอลัมน์แล้ว"); void load(); }
  }

  async function removeColumn(id: string) {
    const { error } = await (supabase as any).from("shop_feature_columns").delete().eq("id", id);
    if (error) toast.error(error.message || "ลบไม่สำเร็จ");
    else { toast.success("ลบคอลัมน์แล้ว"); void load(); }
  }

  async function moveColumn(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= columns.length) return;
    const reordered = [...columns];
    const [row] = reordered.splice(index, 1);
    reordered.splice(next, 0, row);
    setColumns(reordered.map((r, i) => ({ ...r, sort_order: i })));
    await Promise.all(
      reordered.map((r, i) => (supabase as any).from("shop_feature_columns").update({ sort_order: i }).eq("id", r.id)),
    );
  }

  async function addItem(columnId: string) {
    const count = items.filter((i) => i.column_id === columnId).length;
    const { error } = await (supabase as any).from("shop_feature_items").insert({
      column_id: columnId, title: "รายการใหม่", sort_order: count,
    });
    if (error) toast.error(error.message || "เพิ่มไม่สำเร็จ");
    else void load();
  }

  async function removeItem(id: string) {
    const { error } = await (supabase as any).from("shop_feature_items").delete().eq("id", id);
    if (error) toast.error(error.message || "ลบไม่สำเร็จ");
    else void load();
  }

  async function moveItem(columnId: string, index: number, dir: -1 | 1) {
    const list = items.filter((i) => i.column_id === columnId).sort((a, b) => a.sort_order - b.sort_order);
    const next = index + dir;
    if (next < 0 || next >= list.length) return;
    const [row] = list.splice(index, 1);
    list.splice(next, 0, row);
    setItems((rows) => rows.map((r) => {
      const at = list.findIndex((l) => l.id === r.id);
      return at >= 0 ? { ...r, sort_order: at } : r;
    }));
    await Promise.all(
      list.map((r, i) => (supabase as any).from("shop_feature_items").update({ sort_order: i }).eq("id", r.id)),
    );
  }

  return (
    <div className="space-y-3" data-testid="feature-column-manager">
      {columns.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          ยังไม่มีคอลัมน์เมนูพิเศษ — กด “เพิ่มคอลัมน์” เพื่อเริ่มต้น
        </p>
      )}

      {columns.map((col, ci) => {
        const token = toneToken(col.tone);
        const Icon = resolveFeatureIcon(col.icon_name);
        const own = items.filter((i) => i.column_id === col.id).sort((a, b) => a.sort_order - b.sort_order);
        return (
          <div
            key={col.id}
            data-testid={`feature-admin-column-${col.key}`}
            className="rounded-2xl border bg-card p-3 space-y-3"
            style={{ borderColor: `hsl(var(${token}) / 0.4)` }}
          >
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ backgroundColor: `hsl(var(${token}) / 0.16)` }}>
                <Icon className="w-4 h-4" style={{ color: `hsl(var(${token}))` }} aria-hidden />
              </span>
              <Input
                value={col.title}
                aria-label="ชื่อคอลัมน์"
                onChange={(e) => patchColumn(col.id, { title: e.target.value })}
                className="h-11 rounded-xl"
              />
              <label className="flex items-center gap-1 text-xs shrink-0">
                <Switch checked={col.is_active} onCheckedChange={(v) => patchColumn(col.id, { is_active: v })} aria-label={`เปิดคอลัมน์ ${col.title}`} />
                แสดง
              </label>
              <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนขึ้น" onClick={() => void moveColumn(ci, -1)}><ArrowUp className="w-4 h-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนลง" onClick={() => void moveColumn(ci, 1)}><ArrowDown className="w-4 h-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="ลบคอลัมน์" onClick={() => void removeColumn(col.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">คำโปรยใต้หัวข้อ</Label>
                <Input value={col.subtitle ?? ""} onChange={(e) => patchColumn(col.id, { subtitle: e.target.value })} className="h-11 rounded-xl mt-1" />
              </div>
              <div>
                <Label className="text-xs">ลิงก์ปุ่ม “ดูทั้งหมด” (เว้นว่างได้)</Label>
                <Input value={col.link_url ?? ""} onChange={(e) => patchColumn(col.id, { link_url: e.target.value })} className="h-11 rounded-xl mt-1" placeholder="/shop" />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">โทนสี</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-label={`โทน${TONE_LABEL[t]}`}
                      aria-pressed={col.tone === t}
                      onClick={() => patchColumn(col.id, { tone: t })}
                      className={`h-9 px-2 rounded-lg border text-[11px] flex items-center gap-1 ${col.tone === t ? "border-primary ring-1 ring-primary" : "border-border"}`}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ background: `hsl(var(${TONE_TOKEN[t]}))` }} />
                      {TONE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs" htmlFor={`icon-${col.id}`}>ไอคอน</Label>
                <select
                  id={`icon-${col.id}`}
                  value={col.icon_name ?? "Star"}
                  onChange={(e) => patchColumn(col.id, { icon_name: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-2 text-sm"
                >
                  {FEATURE_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs" htmlFor={`src-${col.id}`}>แหล่งข้อมูล</Label>
                <select
                  id={`src-${col.id}`}
                  value={String(col.auto_source ?? "none")}
                  onChange={(e) => patchColumn(col.id, { auto_source: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-2 text-sm"
                >
                  {SOURCES.map((s) => <option key={s} value={s}>{AUTO_SOURCE_LABEL[s]}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-border p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">รายการในคอลัมน์ (แนะนำ 2–3 รายการ)</span>
                <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-xl" onClick={() => void addItem(col.id)}>
                  <Plus className="w-4 h-4 mr-1" /> เพิ่มรายการ
                </Button>
              </div>
              {own.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  ยังไม่มีรายการปักเอง — ระบบจะดึงสินค้าจริงตาม “แหล่งข้อมูล” มาแสดงให้อัตโนมัติ
                </p>
              ) : own.map((it, ii) => (
                <div key={it.id} className="rounded-xl border border-border p-2 space-y-2" data-testid="feature-admin-item">
                  <div className="flex items-center gap-2">
                    <Input value={it.title} aria-label="ชื่อรายการ" onChange={(e) => patchItem(it.id, { title: e.target.value })} className="h-11 rounded-xl" />
                    <label className="flex items-center gap-1 text-xs shrink-0">
                      <Switch checked={it.is_active} onCheckedChange={(v) => patchItem(it.id, { is_active: v })} aria-label={`เปิดรายการ ${it.title}`} />
                      แสดง
                    </label>
                    <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนรายการขึ้น" onClick={() => void moveItem(col.id, ii, -1)}><ArrowUp className="w-4 h-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="เลื่อนรายการลง" onClick={() => void moveItem(col.id, ii, 1)}><ArrowDown className="w-4 h-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="ลบรายการ" onClick={() => void removeItem(it.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <Input value={it.subtitle ?? ""} placeholder="รายละเอียดสั้น" aria-label="รายละเอียดสั้น" onChange={(e) => patchItem(it.id, { subtitle: e.target.value })} className="h-11 rounded-xl" />
                    <Input value={it.price_text ?? ""} placeholder="ราคา เช่น เริ่มต้น 50 บาท" aria-label="ราคา" onChange={(e) => patchItem(it.id, { price_text: e.target.value })} className="h-11 rounded-xl" />
                    <Input value={it.badge_text ?? ""} placeholder="ป้ายกำกับ เช่น ภายใน 30 นาที" aria-label="ป้ายกำกับ" onChange={(e) => patchItem(it.id, { badge_text: e.target.value })} className="h-11 rounded-xl" />
                    <Input value={it.link_url ?? ""} placeholder="ลิงก์ปลายทาง" aria-label="ลิงก์ปลายทาง" onChange={(e) => patchItem(it.id, { link_url: e.target.value })} className="h-11 rounded-xl" />
                    <Input value={it.image_url ?? ""} placeholder="URL รูปย่อ" aria-label="URL รูปย่อ" onChange={(e) => patchItem(it.id, { image_url: e.target.value })} className="h-11 rounded-xl sm:col-span-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" className="min-h-11 rounded-xl" disabled={busy} onClick={() => void addColumn()} data-testid="feature-add-column">
        <Plus className="w-4 h-4 mr-1" /> เพิ่มคอลัมน์
      </Button>
    </div>
  );
}
