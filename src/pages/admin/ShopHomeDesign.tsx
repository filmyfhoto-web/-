import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowLeft, Check, ChevronDown, Eye, Grid2X2, GripVertical, ImagePlus, PanelBottom, Pencil, Plus, RotateCcw, Save, ShoppingBag, Store, Tag, Trash2, Palette } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import PromoManager from "@/components/admin/PromoManager";
import FeatureColumnManager from "@/components/admin/FeatureColumnManager";
import ShareInstallBar from "@/components/ShareInstallBar";
import { openFreshPreview } from "@/lib/freshPreview";
import {
  DEFAULT_SHORTCUTS, DEFAULT_THEME, ICON_NAMES, resolveIcon, themeCssVars,
  hexToHsl, hslToHex, THEME_PRESETS, SECTION_LABELS, DEFAULT_SECTIONS, normalizeSections,
  type ServiceShortcutRow, type ShopTheme, type ShopSectionPref,
} from "@/lib/shopHomeConfig";
import ServiceShortcuts from "@/components/shop/home/ServiceShortcuts";
import AppLivePreview, { AppPreviewProvider, usePublishThemeDraft, usePublishShortcutsDraft } from "@/components/admin/AppLivePreview";

type Row = ServiceShortcutRow;

type Saver = () => Promise<void>;

/** การ์ดหัวข้อของหน้าจัดการ — โครงเดียวกันทุกส่วน อ่านง่ายบนมือถือ */
function SectionCard({
  title, desc, action, children, className,
}: { title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-border bg-card p-4 shadow-card space-y-3 ${className ?? ""}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** ไอคอนประจำแต่ละส่วนของหน้าแอป */
const SECTION_ICONS = { store: Store, services: Grid2X2, banners: Tag, recommended: ShoppingBag, nav: PanelBottom } as const;

/** ย่อรูปไอคอนให้เล็ก แล้วคืนค่าเป็น data URL (ไม่ต้องพึ่ง storage สาธารณะ) */
async function fileToIconDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่รองรับการย่อรูปบนอุปกรณ์นี้");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale, h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

export default function ShopHomeDesignPage() {
  const savers = useRef<Record<string, Saver>>({});
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const register = useCallback((key: string, fn: Saver) => {
    savers.current[key] = fn;
  }, []);

  async function saveAll() {
    setSaving(true);
    try {
      for (const fn of Object.values(savers.current)) await fn();
      toast.success("บันทึกการเปลี่ยนแปลงแล้ว — ลูกค้าเห็นทันที");
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <SeoHead
        title="จัดการหน้าแอพ — ข้อมูลร้าน เมนู โปรโมชั่น"
        description="จัดการหน้าแอพลูกค้าในที่เดียว: โครงหน้าหลัก ข้อมูลร้าน เมนูบริการ โปรโมชั่น และการแสดงผล"
        path="/admin/shop-home"
      />
      <AppPreviewProvider>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] items-start pb-28" data-testid="admin-app-manager">
        <AppLivePreview className="order-1 xl:order-2 xl:sticky xl:top-4" />
        <div className="order-2 xl:order-1 space-y-4 min-w-0">
        <header className="rounded-3xl bg-gradient-primary text-primary-foreground p-4 sm:p-5 shadow-card flex items-start gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            aria-label="ย้อนกลับ"
            className="shrink-0 w-11 h-11 rounded-full bg-background/95 text-primary grid place-items-center shadow-sm transition active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Palette className="w-5 h-5 shrink-0" /> จัดการหน้าแอพ
            </h1>
            <p className="text-sm opacity-90">จัดระเบียบและควบคุมเนื้อหาแอพได้อย่างง่ายดาย</p>
          </div>
          <button
            type="button"
            onClick={() => openFreshPreview("/shop")}
            className="hidden sm:flex items-center gap-2 h-11 px-4 rounded-xl bg-background/95 text-primary text-sm font-semibold shadow-sm transition active:scale-95"
          >
            <Eye className="w-4 h-4" /> ดูตัวอย่างแอพ
          </button>
        </header>

        <div className="rounded-2xl border border-border bg-card p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">แชร์ลิงก์แอพ หรือบันทึกไว้บนหน้าจอโฮมเป็นเว็บแอพ</span>
          <ShareInstallBar url={typeof window !== "undefined" ? `${window.location.origin}/shop` : "/shop"} title="ร้านนัฐภรณ์" />
        </div>

        <AppLayoutEditor register={register} />

        <div className="grid gap-4 xl:grid-cols-2 items-start">
          <SectionCard title="เมนูบริการ" desc="แตะไอคอนเพื่อแก้ชื่อ/ไอคอน/ปลายทาง — ลากเพื่อจัดลำดับ">
            <ShortcutManager register={register} />
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="เมนูพิเศษ (3 คอลัมน์)" desc="บริการยอดนิยม / งานด่วน / แนะนำสำหรับคุณ (บันทึกอัตโนมัติ)">
              <FeatureColumnManager />
            </SectionCard>

            <SectionCard title="Promotions & Campaigns" desc="แบนเนอร์/แคมเปญที่แสดงบนหน้าแรกและหน้า “ฉัน” — บันทึกอัตโนมัติเมื่อแก้ไข">
              <PromoManager />
            </SectionCard>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card shadow-card">
          <button
            type="button"
            data-testid="admin-app-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold min-h-11"
          >
            เพิ่มเติม (ธีมสีขั้นสูง)
            <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>
          {showAdvanced && <div className="px-4 pb-4"><ThemeEditor /></div>}
        </div>
        </div>
      </div>
      </AppPreviewProvider>

      <div
        data-testid="admin-app-sticky-footer"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-3 py-2 flex gap-2 justify-end"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Button
          variant="outline"
          data-testid="admin-app-preview"
          onClick={async () => { await saveAll(); openFreshPreview("/shop"); }}
          disabled={saving}
          className="min-h-12 flex-1 sm:flex-none rounded-xl border-2 border-primary text-primary font-semibold"
        >
          <Eye className="w-4 h-4 mr-1" /> บันทึก + ดูตัวอย่างแอพ
        </Button>
        <Button onClick={() => void saveAll()} disabled={saving} className="min-h-12 flex-1 sm:flex-none rounded-xl font-semibold" data-testid="admin-app-save-all">
          <Save className="w-4 h-4 mr-1" /> บันทึกการเปลี่ยนแปลง
        </Button>
      </div>
    </AdminLayout>
  );
}

function ShortcutManager({ register }: { register?: (key: string, fn: Saver) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("shop_service_shortcuts").select("*").order("sort_order", { ascending: true });
    if (error) toast.error("โหลดเมนูไม่สำเร็จ");
    setRows(((data as Row[]) ?? []).map((r, i) => ({ ...r, sort_order: i })));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length) return;
    const next = rows.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setRows(next.map((r, i) => ({ ...r, sort_order: i })));
  }

  function patch(id: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function addRow() {
    const key = `menu_${Date.now().toString(36)}`;
    setRows((rs) => [
      ...rs,
      { id: `new-${key}`, key, label: "เมนูใหม่", icon_name: "Package", icon_url: null, target_type: "search", target_value: "", sort_order: rs.length, is_active: true },
    ]);
  }

  async function pickIcon(row: Row, file: File) {
    try {
      const url = await fileToIconDataUrl(file);
      patch(row.id, { icon_url: url });
      toast.success("แนบรูปไอคอนแล้ว — อย่าลืมกดบันทึก");
    } catch (e: any) {
      toast.error(e?.message || "อ่านรูปไม่สำเร็จ");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = rows.map((r, i) => ({
        ...(r.id.startsWith("new-") ? {} : { id: r.id }),
        key: r.key,
        label: r.label.trim() || "เมนู",
        icon_name: r.icon_name,
        icon_url: r.icon_url,
        target_type: r.target_type,
        target_value: r.target_value ?? "",
        sort_order: i,
        is_active: r.is_active,
      }));
      const { error } = await (supabase as any)
        .from("shop_service_shortcuts").upsert(payload, { onConflict: "key" });
      if (error) throw error;
      toast.success("บันทึกเมนูแล้ว");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row: Row) {
    if (!row.id.startsWith("new-")) {
      const { error } = await (supabase as any).from("shop_service_shortcuts").delete().eq("id", row.id);
      if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    toast.success("ลบเมนูแล้ว");
  }

  async function resetDefaults() {
    setSaving(true);
    try {
      await (supabase as any).from("shop_service_shortcuts").delete().neq("key", "");
      const { error } = await (supabase as any)
        .from("shop_service_shortcuts").insert(DEFAULT_SHORTCUTS);
      if (error) throw error;
      toast.success("คืนค่าเมนูเริ่มต้นแล้ว");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "คืนค่าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  register?.("shortcuts", save);
  usePublishShortcutsDraft(rows);

  if (loading) return <div className="text-sm text-muted-foreground">กำลังโหลด…</div>;

  const editing = rows.find((r) => r.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{rows.length} รายการ</span>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={addRow}>
          <Plus className="w-4 h-4 mr-1" /> เพิ่มเมนู
        </Button>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
        {rows.map((r, i) => {
          const Icon = resolveIcon(r.icon_name);
          return (
            <div
              key={r.id}
              draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIndex.current != null) move(dragIndex.current, i); dragIndex.current = null; }}
              className="relative"
              data-testid={`shortcut-row-${r.key}`}
            >
              <button
                type="button"
                onClick={() => setEditingId(r.id)}
                aria-label={`แก้ไขเมนู ${r.label}`}
                className={`w-full grid place-items-center gap-1.5 rounded-2xl border p-2 transition active:scale-95 ${r.is_active ? "border-border bg-background" : "border-dashed border-border bg-muted/50 opacity-60"}`}
              >
                <span className="w-12 h-12 rounded-2xl bg-primary/10 grid place-items-center overflow-hidden">
                  {r.icon_url ? <img src={r.icon_url} alt="" className="w-full h-full object-cover" /> : <Icon className="w-6 h-6 text-primary" />}
                </span>
                <span className="text-[11px] leading-tight text-center break-words">{r.label}</span>
              </button>
              <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-background border border-border grid place-items-center pointer-events-none">
                <Pencil className="w-3 h-3 text-primary" />
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-background p-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">ตัวอย่างที่ลูกค้าเห็น</div>
        <ServiceShortcuts items={rows.filter((r) => r.is_active)} onPick={() => {}} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="rounded-xl" onClick={() => void save()} disabled={saving}><Save className="w-4 h-4 mr-1" /> บันทึกเมนู</Button>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void resetDefaults()} disabled={saving}>
          <RotateCcw className="w-4 h-4 mr-1" /> คืนค่าเริ่มต้น
        </Button>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>แก้ไขเมนูบริการ</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="svc-label" className="text-sm">ชื่อเมนู</Label>
                <Input id="svc-label" className="mt-1 h-12 rounded-xl" value={editing.label}
                  onChange={(e) => patch(editing.id, { label: e.target.value })} placeholder="เช่น ถ่ายเอกสาร" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="svc-icon" className="text-sm">ไอคอน</Label>
                  <select
                    id="svc-icon"
                    value={editing.icon_name ?? ""}
                    onChange={(e) => patch(editing.id, { icon_name: e.target.value, icon_url: null })}
                    className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-2 text-sm"
                  >
                    {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="svc-type" className="text-sm">ประเภทปลายทาง</Label>
                  <select
                    id="svc-type"
                    value={editing.target_type}
                    onChange={(e) => patch(editing.id, { target_type: e.target.value as any })}
                    className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-2 text-sm"
                  >
                    <option value="search">ค้นหาสินค้า</option>
                    <option value="route">ลิงก์ในระบบ</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="svc-target" className="text-sm">ปลายทาง</Label>
                <Input id="svc-target" className="mt-1 h-12 rounded-xl" value={editing.target_value}
                  onChange={(e) => patch(editing.id, { target_value: e.target.value })}
                  placeholder={editing.target_type === "route" ? "/my-orders" : "คำค้น"} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <span className="text-sm">แสดงบนหน้าแรก</span>
                <Switch checked={editing.is_active} aria-label={`แสดงเมนู ${editing.label}`}
                  onCheckedChange={(v) => patch(editing.id, { is_active: v })} />
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={(el) => { fileRefs.current[editing.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickIcon(editing, f); e.currentTarget.value = ""; }}
                />
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => fileRefs.current[editing.id]?.click()}>
                  <ImagePlus className="w-4 h-4 mr-1" /> อัปโหลดรูปไอคอน
                </Button>
                {editing.icon_url && (
                  <Button type="button" variant="ghost" onClick={() => patch(editing.id, { icon_url: null })}>ใช้ไอคอนแทน</Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {editing && (
              <Button type="button" variant="outline" className="rounded-xl text-destructive"
                onClick={() => { void removeRow(editing); setEditingId(null); }}>
                <Trash2 className="w-4 h-4 mr-1" /> ลบเมนู
              </Button>
            )}
            <Button type="button" className="rounded-xl" onClick={() => { setEditingId(null); void save(); }}>
              <Save className="w-4 h-4 mr-1" /> บันทึกเมนู
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ThemeEditor() {
  return <ThemeEditorInner />;
}

/** จัดการหน้าแอปลูกค้า — ข้อมูลร้าน ลำดับ/เปิด-ปิด section และขนาดตัวอักษร */
function AppLayoutEditor({ register }: { register?: (key: string, fn: Saver) => void }) {
  const [t, setT] = useState<ShopTheme>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const logoRef = useRef<HTMLInputElement | null>(null);
  const sectionDrag = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("shop_theme_settings").select("id,primary_hsl,accent_hsl,gradient_strength,icon_size,icon_columns,font_scale,shop_name,shop_logo_url,sections,updated_at").eq("id", 1).maybeSingle();
      const { data: lineId } = await (supabase as any).rpc("staff_shop_line_id");
      if (data) {
        setT({
          ...DEFAULT_THEME,
          ...(data as any),
          shop_line_id: (lineId as string | null) ?? null,
          font_scale: Number((data as any).font_scale) || 1,
          sections: normalizeSections((data as any).sections),
        });
      }
    })();
  }, []);

  const sections: ShopSectionPref[] = t.sections?.length ? t.sections : DEFAULT_SECTIONS;

  function moveSection(from: number, to: number) {
    if (to < 0 || to >= sections.length) return;
    const next = sections.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setT((s) => ({ ...s, sections: next }));
  }

  async function pickLogo(file: File) {
    try {
      const url = await fileToIconDataUrl(file);
      setT((s) => ({ ...s, shop_logo_url: url }));
      toast.success("แนบโลโก้แล้ว — อย่าลืมกดบันทึก");
    } catch (e: any) {
      toast.error(e?.message || "อ่านรูปไม่สำเร็จ");
    }
  }

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("shop_theme_settings").upsert({
      id: 1,
      shop_name: (t.shop_name || "").trim() || null,
      shop_logo_url: t.shop_logo_url,
      shop_line_id: (t.shop_line_id || "").trim() || null,
      font_scale: t.font_scale,
      primary_hsl: t.primary_hsl,
      accent_hsl: t.accent_hsl,
      gradient_strength: t.gradient_strength,
      sections,
    });
    setSaving(false);
    if (error) toast.error(error.message || "บันทึกไม่สำเร็จ");
    else toast.success("บันทึกหน้าแอปแล้ว — ลูกค้าเห็นทันที");
  }

  register?.("layout", save);
  usePublishThemeDraft(t);

  const fontChoices: { v: number; label: string }[] = [
    { v: 0.95, label: "เล็ก" },
    { v: 1, label: "กลาง" },
    { v: 1.1, label: "ใหญ่" },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-2 items-start" data-testid="admin-app-layout">
      {/* โครงหน้าหลัก */}
      <SectionCard title="โครงหน้าหลัก" desc="ลากเพื่อจัดลำดับ / เปิด-ปิดการแสดงผล">
        <div className="space-y-2">
          {sections.map((s, i) => {
            const Icon = SECTION_ICONS[s.key] ?? PanelBottom;
            return (
              <div
                key={s.key}
                draggable
                onDragStart={() => { sectionDrag.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (sectionDrag.current != null) moveSection(sectionDrag.current, i); sectionDrag.current = null; }}
                className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2.5"
                data-testid={`app-section-${s.key}`}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" aria-hidden />
                <span className="w-9 h-9 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </span>
                <span className="flex-1 text-sm font-medium truncate">{SECTION_LABELS[s.key]}</span>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="เลื่อนขึ้น" onClick={() => moveSection(i, i - 1)}><ArrowUp className="w-4 h-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="เลื่อนลง" onClick={() => moveSection(i, i + 1)}><ArrowDown className="w-4 h-4" /></Button>
                <Switch
                  checked={s.visible}
                  aria-label={`แสดง ${SECTION_LABELS[s.key]}`}
                  onCheckedChange={(v) => setT((st) => ({ ...st, sections: sections.map((x) => (x.key === s.key ? { ...x, visible: v } : x)) }))}
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="space-y-4">
        {/* ข้อมูลร้าน */}
        <SectionCard title="ข้อมูลร้าน" desc="โลโก้ ชื่อร้าน และช่องทางติดต่อบนหน้าแรก">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-16 shrink-0">โลโก้</span>
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              data-testid="admin-app-logo"
              aria-label="เปลี่ยนโลโก้ร้าน"
              className="relative w-20 h-20 rounded-full overflow-hidden bg-gradient-primary grid place-items-center shadow-card transition active:scale-95"
            >
              {t.shop_logo_url
                ? <img src={t.shop_logo_url} alt="โลโก้ร้าน" className="w-full h-full object-cover" />
                : <ImagePlus className="w-6 h-6 text-primary-foreground" />}
              <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-background border border-border grid place-items-center">
                <Pencil className="w-3.5 h-3.5 text-primary" />
              </span>
            </button>
            <input ref={logoRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickLogo(f); e.currentTarget.value = ""; }} />
            {t.shop_logo_url && (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setT((s) => ({ ...s, shop_logo_url: null }))}>
                <Trash2 className="w-4 h-4 mr-1" /> ลบ
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="app-shop-name" className="text-sm">ชื่อร้าน</Label>
              <Input id="app-shop-name" className="mt-1 h-12 rounded-xl" value={t.shop_name ?? ""}
                onChange={(e) => setT((s) => ({ ...s, shop_name: e.target.value }))} placeholder="นัฐภรณ์ เชียงกลาง" />
            </div>
            <div>
              <Label htmlFor="app-shop-line" className="text-sm">เบอร์ / ไอดี LINE</Label>
              <Input id="app-shop-line" className="mt-1 h-12 rounded-xl" value={t.shop_line_id ?? ""}
                onChange={(e) => setT((s) => ({ ...s, shop_line_id: e.target.value }))} placeholder="@nattafilmyy" />
            </div>
          </div>
        </SectionCard>

        {/* การแสดงผล */}
        <SectionCard title="การแสดงผล" desc="ขนาดตัวอักษร ธีมสี และความเข้มพื้นหลังของแอปลูกค้า">
          <div>
            <Label className="text-sm">ขนาดตัวอักษร</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {fontChoices.map((f) => {
                const active = Math.abs((t.font_scale || 1) - f.v) < 0.03;
                return (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setT((s) => ({ ...s, font_scale: f.v }))}
                    aria-pressed={active}
                    className={`h-11 rounded-xl border text-sm transition ${active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-background text-muted-foreground"}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm">ธีมสี</Label>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {THEME_PRESETS.map((p) => {
                const active = t.primary_hsl === p.primary;
                return (
                  <button
                    key={p.label}
                    type="button"
                    title={p.label}
                    aria-label={p.label}
                    aria-pressed={active}
                    onClick={() => setT((s) => ({ ...s, primary_hsl: p.primary, accent_hsl: p.accent }))}
                    className={`h-12 rounded-xl grid place-items-center transition ${active ? "ring-2 ring-offset-2 ring-primary ring-offset-background" : ""}`}
                    style={{ background: `linear-gradient(135deg, hsl(${p.primary}), hsl(${p.accent}))` }}
                  >
                    {active && (
                      <span className="w-6 h-6 rounded-full bg-background/90 grid place-items-center">
                        <Check className="w-4 h-4 text-primary" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-sm">ความเข้มพื้นหลัง — {t.gradient_strength}%</Label>
            <Slider className="mt-3" value={[t.gradient_strength]} min={0} max={100} step={5}
              onValueChange={([v]) => setT((s) => ({ ...s, gradient_strength: v }))} aria-label="ความเข้มพื้นหลัง" />
          </div>

          <Button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl" data-testid="admin-app-save">
            <Save className="w-4 h-4 mr-1" /> บันทึกหน้าแอป
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}

function ThemeEditorInner() {
  const [t, setT] = useState<ShopTheme>(DEFAULT_THEME);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("shop_theme_settings").select("id,primary_hsl,accent_hsl,gradient_strength,icon_size,icon_columns,font_scale,shop_name,shop_logo_url,sections,updated_at").eq("id", 1).maybeSingle();
      const { data: lineId } = await (supabase as any).rpc("staff_shop_line_id");
      if (data) setT({ ...DEFAULT_THEME, ...(data as any), shop_line_id: (lineId as string | null) ?? null });
    })();
  }, []);

  const previewStyle = useMemo(() => themeCssVars(t) as React.CSSProperties, [t]);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("shop_theme_settings").upsert({
      id: 1,
      primary_hsl: t.primary_hsl,
      accent_hsl: t.accent_hsl,
      gradient_strength: t.gradient_strength,
      icon_size: t.icon_size,
      icon_columns: t.icon_columns,
    });
    setSaving(false);
    if (error) toast.error(error.message || "บันทึกไม่สำเร็จ");
    else toast.success("บันทึกธีมแล้ว");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div>
          <Label className="text-sm">ชุดสีสำเร็จ</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setT((s) => ({ ...s, primary_hsl: p.primary, accent_hsl: p.accent }))}
                className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${t.primary_hsl === p.primary ? "border-primary ring-1 ring-primary" : "border-border"}`}
              >
                <span className="w-4 h-4 rounded-full" style={{ background: `hsl(${p.primary})` }} />
                <span className="w-3 h-3 rounded-full" style={{ background: `hsl(${p.accent})` }} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="theme-primary" className="text-sm">สีหลัก</Label>
            <input
              id="theme-primary"
              type="color"
              value={hslToHex(t.primary_hsl)}
              onChange={(e) => { const h = hexToHsl(e.target.value); if (h) setT((s) => ({ ...s, primary_hsl: h })); }}
              className="mt-1 h-11 w-full rounded-xl border border-input bg-background"
            />
          </div>
          <div>
            <Label htmlFor="theme-accent" className="text-sm">สีปุ่ม/ไฮไลต์</Label>
            <input
              id="theme-accent"
              type="color"
              value={hslToHex(t.accent_hsl)}
              onChange={(e) => { const h = hexToHsl(e.target.value); if (h) setT((s) => ({ ...s, accent_hsl: h })); }}
              className="mt-1 h-11 w-full rounded-xl border border-input bg-background"
            />
          </div>
        </div>

        <div>
          <Label className="text-sm">ความเข้มของไล่เฉดพื้นหลัง — {t.gradient_strength}%</Label>
          <Slider
            className="mt-3"
            value={[t.gradient_strength]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => setT((s) => ({ ...s, gradient_strength: v }))}
            aria-label="ความเข้มของไล่เฉดพื้นหลัง"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">ขนาดไอคอนเมนู</Label>
            <div className="mt-2 inline-flex rounded-xl border border-border overflow-hidden">
              {(["sm", "md", "lg"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setT((v) => ({ ...v, icon_size: s }))}
                  className={`px-3 py-2 text-xs ${t.icon_size === s ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  {s === "sm" ? "เล็ก" : s === "md" ? "กลาง" : "ใหญ่"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm">จำนวนช่องต่อแถว</Label>
            <div className="mt-2 inline-flex rounded-xl border border-border overflow-hidden">
              {[4, 5].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setT((v) => ({ ...v, icon_columns: c }))}
                  className={`px-3 py-2 text-xs ${t.icon_columns === c ? "bg-primary text-primary-foreground" : "bg-card"}`}
                >
                  {c} ช่อง
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border p-4" style={previewStyle} data-testid="theme-preview">
        <div className="text-sm font-semibold mb-2">ตัวอย่าง</div>
        <div
          className="rounded-2xl p-3"
          style={{ background: `linear-gradient(180deg, hsl(var(--card)), hsl(var(--primary) / ${0.06 + (t.gradient_strength / 100) * 0.22}))` }}
        >
          <ServiceShortcuts items={[]} onPick={() => {}} size={t.icon_size} columns={t.icon_columns} />
          <Button className="rounded-xl" style={{ background: "var(--gradient-primary)" }}>ปุ่มตัวอย่าง</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()} disabled={saving}><Save className="w-4 h-4 mr-1" /> บันทึกธีม</Button>
        <Button type="button" variant="outline" onClick={() => setT(DEFAULT_THEME)}><RotateCcw className="w-4 h-4 mr-1" /> คืนค่าเริ่มต้น</Button>
      </div>
    </div>
  );
}