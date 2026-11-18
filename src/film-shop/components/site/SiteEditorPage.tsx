import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Monitor, Smartphone, RotateCcw, Save, Undo2, Upload, Trash2,
  ArrowUp, ArrowDown, ShieldAlert, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  clampHeroScale, HERO_SCALE_MIN, HERO_SCALE_MAX, HERO_BREAKPOINTS,
  heroScaleOf, heroAlignOf, type HeroBreakpoint,
} from '@/lib/siteConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { WelcomeView } from '@/pages/Welcome';
import { useSiteConfig, saveSiteConfig } from '@/hooks/useSiteConfig';
import { useFormGuard } from '@/hooks/useFormGuard';
import { useUserRole } from '@/film-shop/hooks/useUserRole';
import { useAuth } from '@/film-shop/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { fitImageToCover, IMAGE_PRESETS } from '@/lib/imageFit';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ANCHOR_OPTIONS, DEFAULT_SITE_CONFIG, LOCKED_SECTIONS, PUBLIC_ROUTE_OPTIONS, SECTION_LABELS,
  WEBSITE_ASSET_BUCKET, isCtaReady, isValidExternalUrl, isValidMenuTarget, moveMenuItem, moveSection,
  type SiteConfig, type SiteCta, type SiteMenuKind, type SiteSectionKey,
} from '@/lib/siteConfig';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** ตัวเลือกปลายทางของปุ่ม — ใช้ร่วมกันทุก CTA เพื่อไม่ให้เกิดปุ่มที่กดแล้วไม่ไปไหน */
function CtaTargetPicker({
  cta, onChange, testId,
}: { cta: SiteCta; onChange: (next: SiteCta) => void; testId: string }) {
  const invalid = !isValidMenuTarget(cta);
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[160px] flex-1"
          placeholder="ข้อความบนปุ่ม"
          value={cta.label}
          onChange={(e) => onChange({ ...cta, label: e.target.value })}
        />
        <Select
          value={cta.kind}
          onValueChange={(v) => {
            const kind = v as SiteMenuKind;
            const to = kind === 'route' ? PUBLIC_ROUTE_OPTIONS[0].to : kind === 'anchor' ? ANCHOR_OPTIONS[0].to : '';
            onChange({ ...cta, kind, to });
          }}
        >
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="route">หน้าในเว็บ</SelectItem>
            <SelectItem value="anchor">จุดในหน้าแรก</SelectItem>
            <SelectItem value="external">ลิงก์ภายนอก</SelectItem>
          </SelectContent>
        </Select>
        {cta.kind === 'external' ? (
          <Input
            className="min-w-[180px] flex-1"
            placeholder="https://..."
            value={cta.to}
            onChange={(e) => onChange({ ...cta, to: e.target.value })}
          />
        ) : (
          <Select value={cta.to} onValueChange={(to) => onChange({ ...cta, to })}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="เลือกปลายทาง" /></SelectTrigger>
            <SelectContent>
              {(cta.kind === 'route' ? PUBLIC_ROUTE_OPTIONS : ANCHOR_OPTIONS).map((o) => (
                <SelectItem key={o.to} value={o.to}>{o.label} — {o.to}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Switch
          checked={cta.enabled}
          aria-label="แสดงปุ่มนี้"
          onCheckedChange={(v) => onChange({ ...cta, enabled: v })}
        />
      </div>
      {cta.enabled && invalid && (
        <p className="text-[11.5px] text-destructive">
          ปลายทางยังไม่ถูกต้อง — ปุ่มนี้จะไม่ถูกแสดงบนหน้าจริงจนกว่าจะเลือกปลายทางที่มีอยู่จริง
        </p>
      )}
      {cta.enabled && !invalid && !cta.label.trim() && (
        <p className="text-[11.5px] text-destructive">ต้องมีข้อความบนปุ่ม</p>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[13px] font-semibold text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-border bg-card p-4 shadow-sm">
      <h3 className="text-[15px] font-bold">{title}</h3>
      {desc && <p className="mb-3 mt-0.5 text-[12px] text-muted-foreground">{desc}</p>}
      <div className={desc ? 'space-y-3' : 'mt-3 space-y-3'}>{children}</div>
    </section>
  );
}

/**
 * “จัดการหน้าเว็บไซต์” — แก้ข้อความ/รูป/เมนู/ส่วนแสดงผลของหน้า public landing
 * ทุกอย่างเป็น presentation config เท่านั้น ไม่แตะ orders / documents / POS /
 * queue / group bot และ role guard ยังบังคับที่ฐานข้อมูล (RLS) อีกชั้น
 */
export function SiteEditorPage() {
  const { config, loading, error, reload } = useSiteConfig();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [draft, setDraft] = useState<SiteConfig>(config);
  const [saved, setSaved] = useState<SiteConfig>(config);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dashFileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<
    { field: 'hero_image_url' | 'dashboard_image_url'; blob: Blob; url: string; width: number; height: number } | null
  >(null);

  useEffect(() => { setDraft(config); setSaved(config); }, [config]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useFormGuard(dirty);

  const patch = (p: Partial<SiteConfig>) => setDraft((d) => ({ ...d, ...p }));

  const onSave = async () => {
    const bad = draft.menu.find((m) => !isValidMenuTarget(m));
    if (bad) { toast.error(`ปลายทางของเมนู “${bad.label}” ไม่ถูกต้อง`); return; }
    if (draft.line_cta.enabled && !isValidExternalUrl(draft.line_cta.url)) {
      toast.error('ลิงก์ LINE ต้องขึ้นต้นด้วย https://'); return;
    }
    const ctas: [string, SiteCta][] = [
      ['ปุ่มสั่งซื้อสินค้า', draft.cta_shop],
      ['ปุ่มคำสั่งซื้อของฉัน', draft.cta_orders],
      ['ปุ่มหมวดหมู่สินค้า', draft.cta_categories],
    ];
    const badCta = ctas.find(([, c]) => c.enabled && !isCtaReady(c));
    if (badCta) { toast.error(`${badCta[0]}: ต้องมีข้อความและปลายทางที่ใช้งานได้จริง`); return; }
    setSaving(true);
    try {
      await saveSiteConfig(draft, user?.id);
      setSaved(draft);
      toast.success('บันทึกการเปลี่ยนแปลงเรียบร้อย');
      void reload();
    } catch (e) {
      toast.error('บันทึกไม่สำเร็จ: ' + ((e as { message?: string }).message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  /** เลือกไฟล์ → ครอป/ย่ออัตโนมัติ → แสดงตัวอย่างก่อนอัปโหลดจริง */
  const onPickImage = async (
    file: File,
    field: 'hero_image_url' | 'dashboard_image_url' = 'hero_image_url',
  ) => {
    if (!file.type.startsWith('image/')) { toast.error('รองรับเฉพาะไฟล์รูปภาพ'); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast.error('ไฟล์ใหญ่เกิน 5 MB'); return; }
    if (fileRef.current) fileRef.current.value = '';
    if (dashFileRef.current) dashFileRef.current.value = '';
    try {
      const preset = field === 'dashboard_image_url' ? IMAGE_PRESETS.dashboard : IMAGE_PRESETS.hero;
      const fit = await fitImageToCover(file, preset);
      setPending({ field, blob: fit.blob, url: fit.url, width: fit.width, height: fit.height });
    } catch (e) {
      toast.error('เตรียมรูปไม่สำเร็จ: ' + ((e as { message?: string }).message ?? ''));
    }
  };

  const onUpload = async (
    file: Blob,
    field: 'hero_image_url' | 'dashboard_image_url' = 'hero_image_url',
  ) => {
    setUploading(true);
    try {
      const path = `${field === 'dashboard_image_url' ? 'dashboard' : 'hero'}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(WEBSITE_ASSET_BUCKET)
        .upload(path, file, { upsert: false, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data, error: signErr } = await supabase.storage
        .from(WEBSITE_ASSET_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !data?.signedUrl) throw signErr ?? new Error('สร้างลิงก์รูปไม่สำเร็จ');
      patch({ [field]: data.signedUrl } as Partial<typeof draft>);
      toast.success('อัปโหลดรูปเรียบร้อย — กดบันทึกเพื่อใช้งานจริง');
    } catch (e) {
      toast.error('อัปโหลดไม่สำเร็จ: ' + ((e as { message?: string }).message ?? ''));
    } finally {
      setUploading(false);
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div data-testid="site-editor-loading" className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="site-editor" className="space-y-4">
      {/* หัวหน้าจอ + ปุ่มจริง */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-[18px] font-extrabold">จัดการหน้าเว็บไซต์</h2>
          <p className="text-[12px] text-muted-foreground">
            แก้ข้อความ รูป เมนู และส่วนที่แสดงบนหน้าแรกของลูกค้า — จะมีผลจริงเมื่อกด “บันทึกการเปลี่ยนแปลง”
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span data-testid="site-editor-dirty" className="rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-semibold text-amber-800">ยังไม่ได้บันทึก</span>}
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13px] font-semibold hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> เปิดหน้าจริง
          </a>
          <Button
            variant="outline"
            size="sm"
            data-testid="site-editor-cancel"
            disabled={!dirty || saving}
            onClick={() => { setDraft(saved); toast.success('ยกเลิกการแก้ไขแล้ว'); }}
          >
            <Undo2 className="mr-1.5 h-4 w-4" /> ยกเลิกการแก้ไข
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="site-editor-reset" disabled={saving || !isAdmin}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> คืนค่าเริ่มต้น
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>คืนค่าเริ่มต้นของหน้าเว็บไซต์?</AlertDialogTitle>
                <AlertDialogDescription>
                  ข้อความ รูป เมนู และลำดับส่วนแสดงผลทั้งหมดจะกลับไปเป็นค่าตั้งต้นของร้าน
                  (ยังไม่มีผลจนกว่าจะกด “บันทึกการเปลี่ยนแปลง”)
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction onClick={() => { setDraft(DEFAULT_SITE_CONFIG); toast.success('คืนค่าเริ่มต้นในฟอร์มแล้ว'); }}>
                  คืนค่าเริ่มต้น
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" data-testid="site-editor-save" disabled={!dirty || saving || !isAdmin} onClick={() => void onSave()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            บันทึกการเปลี่ยนแปลง
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <div data-testid="site-editor-readonly" className="flex items-center gap-2 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <ShieldAlert className="h-4 w-4" /> เฉพาะเจ้าของร้าน/ผู้ดูแลระบบเท่านั้นที่บันทึกได้ — คุณดูตัวอย่างได้อย่างเดียว
        </div>
      )}

      {error && (
        <div data-testid="site-editor-error" className="rounded-[12px] border border-destructive/40 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
          โหลดการตั้งค่าไม่สำเร็จ (แสดงค่าเริ่มต้นแทน): {error}
          <Button variant="link" size="sm" onClick={() => void reload()}>ลองใหม่</Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        {/* ---------------- ฟอร์ม ---------------- */}
        <Tabs defaultValue="home" className="min-w-0">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="home">หน้าแรก</TabsTrigger>
            <TabsTrigger value="menu">เมนูเว็บไซต์</TabsTrigger>
            <TabsTrigger value="cta">ปุ่มและลิงก์</TabsTrigger>
            <TabsTrigger value="sections">ส่วนแสดงผล</TabsTrigger>
          </TabsList>

          {/* ===== แท็บ 1: หน้าแรก ===== */}
          <TabsContent value="home" className="mt-3 space-y-4">
            <Card title="ข้อความบนแบนเนอร์หลัก">
              <Field label="ข้อความเล็กเหนือหัวข้อ">
                <Input value={draft.brand_label} onChange={(e) => patch({ brand_label: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="หัวข้อ บรรทัดที่ 1">
                  <Input value={draft.hero_title_line1} onChange={(e) => patch({ hero_title_line1: e.target.value })} />
                </Field>
                <Field label="หัวข้อ บรรทัดที่ 2" hint="เว้นว่างได้ถ้าต้องการบรรทัดเดียว">
                  <Input value={draft.hero_title_line2} onChange={(e) => patch({ hero_title_line2: e.target.value })} />
                </Field>
              </div>
              <Field label="คำอธิบาย">
                <Textarea rows={3} value={draft.hero_desc} onChange={(e) => patch({ hero_desc: e.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="หัวข้อเวลาเปิดร้าน">
                  <Input value={draft.hours_label} onChange={(e) => patch({ hours_label: e.target.value })} />
                </Field>
                <Field label="เวลาเปิดร้าน">
                  <Input value={draft.hours_text} onChange={(e) => patch({ hours_text: e.target.value })} />
                </Field>
              </div>
            </Card>

            <Card title="รูปใหญ่ด้านขวา" desc="แนะนำภาพแนวนอน ขนาดไม่เกิน 5 MB">
              <div className="flex flex-wrap items-start gap-3">
                <div className="h-28 w-44 shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted">
                  {draft.hero_image_url ? (
                    <img src={draft.hero_image_url} alt="ตัวอย่างรูป hero" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[11.5px] text-muted-foreground">รูปเดิมของระบบ</div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="site-editor-hero-file"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f); }}
                  />
                  <Button variant="outline" size="sm" disabled={uploading || !isAdmin} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                    อัปโหลดรูปใหม่
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!draft.hero_image_url}
                    onClick={() => patch({ hero_image_url: null })}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> คืนรูปเดิม
                  </Button>
                </div>
              </div>

              <HeroImageSizeControls draft={draft} patch={patch} />
            </Card>

            <Card title="รูปโชว์บนแดชบอร์ดหลังบ้าน" desc="แสดงในแบนเนอร์ม่วงหน้าแรกของแอดมิน (ไม่เกิน 5 MB)">
              <div className="flex flex-wrap items-start gap-3">
                <div className="h-28 w-44 shrink-0 overflow-hidden rounded-[10px] border border-border bg-muted">
                  {draft.dashboard_image_url ? (
                    <img src={draft.dashboard_image_url} alt="ตัวอย่างรูปแดชบอร์ด" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[11.5px] text-muted-foreground">ยังไม่มีรูป</div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={dashFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    data-testid="site-editor-dashboard-file"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickImage(f, 'dashboard_image_url'); }}
                  />
                  <Button variant="outline" size="sm" disabled={uploading || !isAdmin} onClick={() => dashFileRef.current?.click()}>
                    {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                    อัปโหลดรูปใหม่
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!draft.dashboard_image_url}
                    onClick={() => patch({ dashboard_image_url: null })}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> เอารูปออก
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="การ์ดจุดเด่น 3 ใบ">
              {draft.highlights.map((h, i) => (
                <div key={h.id} className="rounded-[10px] border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold">ใบที่ {i + 1}</span>
                    <Switch
                      data-testid={`site-highlight-${h.id}`}
                      checked={h.visible}
                      onCheckedChange={(v) => patch({
                        highlights: draft.highlights.map((x) => (x.id === h.id ? { ...x, visible: v } : x)),
                      })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={h.title}
                      placeholder="หัวข้อ"
                      onChange={(e) => patch({ highlights: draft.highlights.map((x) => (x.id === h.id ? { ...x, title: e.target.value } : x)) })}
                    />
                    <Input
                      value={h.desc}
                      placeholder="รายละเอียด"
                      onChange={(e) => patch({ highlights: draft.highlights.map((x) => (x.id === h.id ? { ...x, desc: e.target.value } : x)) })}
                    />
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>

          {/* ===== แท็บ 2: เมนูเว็บไซต์ ===== */}
          <TabsContent value="menu" className="mt-3 space-y-4">
            <Card title="เมนูด้านบนของเว็บไซต์" desc="เปลี่ยนชื่อที่แสดงได้ ปลายทางเลือกจากหน้าที่มีอยู่จริง — ปิดเมนูคือซ่อนเฉพาะปุ่ม ไม่ได้ลบหน้า">
              {draft.menu.map((m, i) => (
                <div key={m.id} data-testid={`site-menu-${m.id}`} className="rounded-[10px] border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-[140px] flex-1"
                      value={m.label}
                      onChange={(e) => patch({ menu: draft.menu.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)) })}
                    />
                    <Select
                      value={m.kind}
                      onValueChange={(v) => {
                        const kind = v as SiteMenuKind;
                        const to = kind === 'route' ? PUBLIC_ROUTE_OPTIONS[0].to : kind === 'anchor' ? ANCHOR_OPTIONS[0].to : '';
                        patch({ menu: draft.menu.map((x) => (x.id === m.id ? { ...x, kind, to } : x)) });
                      }}
                    >
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="route">หน้าในเว็บ</SelectItem>
                        <SelectItem value="anchor">จุดในหน้าแรก</SelectItem>
                        <SelectItem value="external">ลิงก์ภายนอก</SelectItem>
                      </SelectContent>
                    </Select>
                    {m.kind === 'external' ? (
                      <Input
                        className="min-w-[180px] flex-1"
                        placeholder="https://..."
                        value={m.to}
                        onChange={(e) => patch({ menu: draft.menu.map((x) => (x.id === m.id ? { ...x, to: e.target.value } : x)) })}
                      />
                    ) : (
                      <Select
                        value={m.to}
                        onValueChange={(to) => patch({ menu: draft.menu.map((x) => (x.id === m.id ? { ...x, to } : x)) })}
                      >
                        <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(m.kind === 'route' ? PUBLIC_ROUTE_OPTIONS : ANCHOR_OPTIONS).map((o) => (
                            <SelectItem key={o.to} value={o.to}>{o.label} — {o.to}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => setDraft((d) => moveMenuItem(d, m.id, -1))}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" aria-label="เลื่อนลง" disabled={i === draft.menu.length - 1} onClick={() => setDraft((d) => moveMenuItem(d, m.id, 1))}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={m.visible}
                        aria-label="แสดงเมนูนี้"
                        onCheckedChange={(v) => patch({ menu: draft.menu.map((x) => (x.id === m.id ? { ...x, visible: v } : x)) })}
                      />
                    </div>
                  </div>
                  {m.kind === 'external' && m.to && !isValidExternalUrl(m.to) && (
                    <p className="mt-1.5 text-[11.5px] text-destructive">ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://</p>
                  )}
                </div>
              ))}
            </Card>
          </TabsContent>

          {/* ===== แท็บ 3: ปุ่มและลิงก์ ===== */}
          <TabsContent value="cta" className="mt-3 space-y-4">
            <Card title="ปุ่ม “เพิ่มเพื่อนใน LINE”">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-semibold">แสดงปุ่มนี้</Label>
                <Switch
                  data-testid="site-cta-line"
                  checked={draft.line_cta.enabled}
                  onCheckedChange={(v) => patch({ line_cta: { ...draft.line_cta, enabled: v } })}
                />
              </div>
              <Field label="ข้อความบนปุ่ม">
                <Input value={draft.line_cta.label} onChange={(e) => patch({ line_cta: { ...draft.line_cta, label: e.target.value } })} />
              </Field>
              <Field label="ลิงก์ LINE" hint="ต้องเป็น https://">
                <Input value={draft.line_cta.url} onChange={(e) => patch({ line_cta: { ...draft.line_cta, url: e.target.value } })} />
              </Field>
              {!isValidExternalUrl(draft.line_cta.url) && (
                <p className="text-[11.5px] text-destructive">ลิงก์ไม่ถูกต้อง</p>
              )}
              <Field label="ข้อความใต้ปุ่ม">
                <Input value={draft.line_cta.note} onChange={(e) => patch({ line_cta: { ...draft.line_cta, note: e.target.value } })} />
              </Field>
            </Card>

            <Card title="ปุ่มในกล่อง “สั่งซื้อสินค้ากับร้าน”" desc="ปลายทางคงที่ที่หน้าจริงในระบบ (/shop และ /my-orders) เพื่อไม่ให้เกิดปุ่มที่กดแล้วไม่ไปไหน">
              <Field label="หัวข้อกล่อง">
                <Input value={draft.order_title} onChange={(e) => patch({ order_title: e.target.value })} />
              </Field>
              <Field label="คำอธิบายกล่อง">
                <Input value={draft.order_desc} onChange={(e) => patch({ order_desc: e.target.value })} />
              </Field>
              <CtaTargetPicker
                testId="site-cta-shop"
                cta={draft.cta_shop}
                onChange={(cta_shop) => patch({ cta_shop })}
              />
              <CtaTargetPicker
                testId="site-cta-orders"
                cta={draft.cta_orders}
                onChange={(cta_orders) => patch({ cta_orders })}
              />
              <CtaTargetPicker
                testId="site-cta-categories"
                cta={draft.cta_categories}
                onChange={(cta_categories) => patch({ cta_categories })}
              />
            </Card>
          </TabsContent>

          {/* ===== แท็บ 4: ส่วนแสดงผล ===== */}
          <TabsContent value="sections" className="mt-3 space-y-4">
            <Card title="ส่วนต่าง ๆ ของหน้าแรก" desc="ปิดคือซ่อนการแสดงผล ไม่ได้ลบข้อมูลหรือหน้าใด ๆ — แบนเนอร์หลักและจุดเด่นตำแหน่งคงที่">
              {draft.sections.map((s, i) => {
                const locked = LOCKED_SECTIONS.includes(s.key);
                return (
                  <div key={s.key} data-testid={`site-section-${s.key}`} className="flex items-center justify-between gap-2 rounded-[10px] border border-border p-3">
                    <span className="text-[13.5px] font-semibold">{SECTION_LABELS[s.key as SiteSectionKey]}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline" size="icon" aria-label="เลื่อนขึ้น"
                        disabled={locked || LOCKED_SECTIONS.includes(draft.sections[i - 1]?.key ?? 'hero')}
                        onClick={() => setDraft((d) => moveSection(d, s.key, -1))}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline" size="icon" aria-label="เลื่อนลง"
                        disabled={locked || i === draft.sections.length - 1}
                        onClick={() => setDraft((d) => moveSection(d, s.key, 1))}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Switch
                        checked={s.visible}
                        aria-label="แสดงส่วนนี้"
                        onCheckedChange={(v) => patch({ sections: draft.sections.map((x) => (x.key === s.key ? { ...x, visible: v } : x)) })}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          </TabsContent>
        </Tabs>

        {/* ตัวอย่างรูปหลังครอปอัตโนมัติ — ยืนยันก่อนอัปโหลดจริง */}
        <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
          <DialogContent className="max-w-lg" data-testid="site-image-preview-dialog">
            <DialogHeader>
              <DialogTitle>
                ตัวอย่างรูป{pending?.field === 'dashboard_image_url' ? 'บนแดชบอร์ด' : 'หน้าแรก'}
              </DialogTitle>
            </DialogHeader>
            {pending && (
              <>
                <div
                  className="overflow-hidden rounded-[10px] border border-border bg-muted"
                  style={{ aspectRatio: `${pending.width} / ${pending.height}` }}
                >
                  <img src={pending.url} alt="ตัวอย่างรูปก่อนอัปโหลด" className="h-full w-full object-cover" />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  ระบบครอปและย่อให้อัตโนมัติเป็น {pending.width}×{pending.height} พิกเซล เพื่อให้ภาพไม่ยืดหรือถูกตัดผิดสัดส่วนในทุกขนาดหน้าจอ
                </p>
              </>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setPending(null)} data-testid="site-image-preview-cancel">
                ยกเลิก
              </Button>
              <Button
                disabled={uploading || !pending}
                data-testid="site-image-preview-confirm"
                onClick={() => { if (pending) void onUpload(pending.blob, pending.field); }}
              >
                {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                ใช้รูปนี้
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------------- Live Preview ---------------- */}
        <aside className="min-w-0">
          <div className="sticky top-4 rounded-[12px] border border-border bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13.5px] font-bold">พรีวิวสด</span>
              <div className="flex items-center gap-1">
                <Button variant={device === 'desktop' ? 'default' : 'outline'} size="sm" data-testid="site-preview-desktop" onClick={() => setDevice('desktop')}>
                  <Monitor className="mr-1 h-4 w-4" /> เดสก์ท็อป
                </Button>
                <Button variant={device === 'mobile' ? 'default' : 'outline'} size="sm" data-testid="site-preview-mobile" onClick={() => setDevice('mobile')}>
                  <Smartphone className="mr-1 h-4 w-4" /> มือถือ
                </Button>
              </div>
            </div>
            <div
              data-testid="site-preview"
              data-device={device}
              className="h-[620px] overflow-auto rounded-[10px] border border-border bg-white"
            >
              <div
                className="origin-top-left"
                style={{
                  width: device === 'desktop' ? 1440 : 390,
                  transform: `scale(${device === 'desktop' ? 0.36 : 0.9})`,
                  transformOrigin: 'top left',
                }}
              >
                <WelcomeView config={draft} preview />
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              พรีวิวเปลี่ยนทันทีที่พิมพ์ — หน้าจริงจะเปลี่ยนเมื่อกด “บันทึกการเปลี่ยนแปลง”
              · คลิกปุ่มในพรีวิวได้เพื่อดูปลายทาง (ไม่เปลี่ยนหน้าและไม่บันทึกข้อมูล)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default SiteEditorPage;

/** ขนาด/ตำแหน่งรูปโชว์ แยกตามหน้าจอ มือถือ / แท็บเล็ต / เดสก์ท็อป */
function HeroImageSizeControls({
  draft,
  patch,
}: {
  draft: SiteConfig;
  patch: (p: Partial<SiteConfig>) => void;
}) {
  const [bp, setBp] = useState<HeroBreakpoint>('desktop');
  const scale = heroScaleOf(draft, bp);
  const align = heroAlignOf(draft, bp);

  const setScale = (v: number) => {
    const n = clampHeroScale(v);
    patch(
      bp === 'mobile'
        ? { hero_image_scale_mobile: n }
        : bp === 'tablet'
          ? { hero_image_scale_tablet: n }
          : { hero_image_scale: n },
    );
  };

  const setAlign = (v: 'left' | 'center' | 'right') => {
    patch(
      bp === 'mobile'
        ? { hero_image_align_mobile: v }
        : bp === 'tablet'
          ? { hero_image_align_tablet: v }
          : { hero_image_align: v },
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-[13px] font-semibold">ขนาดรูปโชว์</Label>
        <div className="ml-auto flex gap-1.5">
          {HERO_BREAKPOINTS.map((b) => (
            <Button
              key={b.key}
              type="button"
              size="sm"
              variant={bp === b.key ? 'default' : 'outline'}
              data-testid={`site-editor-hero-bp-${b.key}`}
              onClick={() => setBp(b.key)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>ปรับเฉพาะ {HERO_BREAKPOINTS.find((b) => b.key === bp)?.label} ({HERO_BREAKPOINTS.find((b) => b.key === bp)?.hint})</span>
        <span className="tabular-nums">{scale}%</span>
      </div>
      <Slider
        data-testid="site-editor-hero-scale"
        value={[scale]}
        min={HERO_SCALE_MIN}
        max={HERO_SCALE_MAX}
        step={5}
        onValueChange={([v]) => setScale(v)}
      />
      <div>
        <Label className="text-[13px] font-semibold">ตำแหน่งรูป</Label>
        <div className="mt-2 flex gap-2">
          {([
            { key: 'left', label: 'ซ้าย' },
            { key: 'center', label: 'กลาง' },
            { key: 'right', label: 'ขวา' },
          ] as const).map((o) => (
            <Button
              key={o.key}
              type="button"
              size="sm"
              variant={align === o.key ? 'default' : 'outline'}
              onClick={() => setAlign(o.key)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
