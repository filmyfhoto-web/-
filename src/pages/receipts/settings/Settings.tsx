import { useEffect, useRef, useState } from "react";
import { liveChannel } from "@/lib/realtimeChannel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentStore, storeBasePath, useStoreSlug } from "../useStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { triggerSync, SyncAuthError } from "../lib/syncStub";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLocation, useNavigate } from "react-router-dom";
import { saveDraft, loadDraft, clearDraft, draftHasContent } from "../lib/drafts";
import { useFormGuard } from "@/hooks/useFormGuard";
import { DEFAULT_DOC_THEME, DOC_TYPE_ORDER, DOC_TYPE_LABEL } from "../lib/docTheme";
import { Link as RouterLink } from "react-router-dom";
import { FolderCheck, ExternalLink } from "lucide-react";
import { FolderTree, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link as RouterLink2 } from "react-router-dom";
import GoogleDriveStatusCard from "./GoogleDriveStatusCard";
import SyncAutoRetryCard from "./SyncAutoRetryCard";
import BackfillDriveCard from "./BackfillDriveCard";
import PerStoreSyncStatusCard from "./PerStoreSyncStatusCard";
import StoreAdminsTab from "./StoreAdminsTab";
import LayoutsManager from "./LayoutsManager";
import { tbl } from "../lib/tbl";
import { useAuth } from "@/contexts/AuthContext";
import { Lock } from "lucide-react";
/**
 * Record an audit row when an admin/owner views or downloads a store's
 * attachment file (business registration, ID copy, bankbook). The row
 * includes user_id + store_id + which file + which action.
 */
async function logAttachmentAccess(
  storeId: string,
  kind: string,
  action: "store_attachment_view" | "store_attachment_download",
) {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from(tbl("activity_logs") as any).insert({
      store_id: storeId,
      user_id: u?.user?.id ?? null,
      action,
      target_type: "store_attachment",
      target_id: null,
      detail: { kind } as any,
    });
  } catch {
    /* best-effort */
  }
}

const TH_TYPES: Record<string, string> = {
  receipt: "ใบเสร็จรับเงิน",
  delivery: "ใบส่งของ",
  tax_invoice: "ใบกำกับภาษี",
  quotation: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้ (เลิกใช้)",
};

const BRAND_PRESETS: { label: string; value: string; swatch: string }[] = [
  { label: "น้ำเงิน (คัลเลอร์แล็ป)", value: "221 83% 45%", swatch: "hsl(221 83% 45%)" },
  { label: "เขียว (การพิมพ์)", value: "160 72% 38%", swatch: "hsl(160 72% 38%)" },
  { label: "เทอร์ควอยซ์", value: "175 60% 42%", swatch: "hsl(175 60% 42%)" },
  { label: "ส้ม", value: "20 90% 55%", swatch: "hsl(20 90% 55%)" },
  { label: "ม่วง", value: "265 75% 55%", swatch: "hsl(265 75% 55%)" },
  { label: "เทาเข้ม", value: "220 15% 30%", swatch: "hsl(220 15% 30%)" },
];

async function uploadStoreLogo(storeId: string, file: File): Promise<string> {
  const allowed = ["image/png", "image/jpeg", "image/jpg"];
  const okExt = /\.(png|jpe?g)$/i.test(file.name);
  if (!allowed.includes(file.type) && !okExt) {
    throw new Error("รองรับเฉพาะไฟล์ PNG หรือ JPG เท่านั้น");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error(`ไฟล์ใหญ่เกิน 2MB (ไฟล์นี้ ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${storeId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  // private bucket → signed URL valid for ~10 years
  const { data, error: sErr } = await supabase.storage.from("store-logos").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("ไม่สามารถสร้าง URL ได้");
  return data.signedUrl;
}

async function uploadStoreAttachment(storeId: string, file: File, kind: string): Promise<string> {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
  const okExt = /\.(png|jpe?g|pdf)$/i.test(file.name);
  if (!allowed.includes(file.type) && !okExt) {
    throw new Error("รองรับเฉพาะไฟล์ PNG, JPG หรือ PDF");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`ไฟล์ใหญ่เกิน 5MB (ไฟล์นี้ ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${storeId}/attach-${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage
    .from("store-logos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr || !data?.signedUrl) throw sErr ?? new Error("ไม่สามารถสร้าง URL ได้");
  return data.signedUrl;
}

export default function ReceiptsSettings() {
  const { store } = useCurrentStore();
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold text-foreground">ตั้งค่าร้าน</h1>
      {!store ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : (
        <Tabs defaultValue="store">
          <TabsList className="w-full md:w-auto flex-wrap h-auto">
            <TabsTrigger value="store">ข้อมูลร้าน</TabsTrigger>
            <TabsTrigger value="docs">เลขเอกสาร</TabsTrigger>
            <TabsTrigger value="payment">วิธีชำระเงิน</TabsTrigger>
            <TabsTrigger value="tax">อัตราภาษี</TabsTrigger>
            <TabsTrigger value="units">หน่วยนับ</TabsTrigger>
            <TabsTrigger value="templates">เทมเพลตเอกสาร</TabsTrigger>
            <TabsTrigger value="layouts">เลย์เอาต์เอกสาร</TabsTrigger>
            <TabsTrigger value="doc_theme">ธีมสีเอกสาร</TabsTrigger>
            <TabsTrigger value="google">Google Sheets / Drive</TabsTrigger>
            <TabsTrigger value="admins">แอดมินร้าน</TabsTrigger>
          </TabsList>
          <TabsContent value="store"><StoreInfoTab storeId={store.id} /></TabsContent>
          <TabsContent value="docs"><DocSettingsTab storeId={store.id} /></TabsContent>
          <TabsContent value="payment"><SimpleListTab storeId={store.id} table={tbl("payment_methods")} title="วิธีชำระเงิน" hasSort /></TabsContent>
          <TabsContent value="tax"><TaxRatesTab storeId={store.id} /></TabsContent>
          <TabsContent value="units"><SimpleListTab storeId={store.id} table={tbl("units")} title="หน่วยนับ" /></TabsContent>
            <TabsContent value="templates"><DocTemplatesTab storeId={store.id} /></TabsContent>
          <TabsContent value="layouts"><LayoutsManager storeId={store.id} /></TabsContent>
          <TabsContent value="doc_theme"><DocThemeTab storeId={store.id} /></TabsContent>
          <TabsContent value="google"><GoogleTab storeId={store.id} /></TabsContent>
          <TabsContent value="admins"><StoreAdminsTab storeId={store.id} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StoreInfoTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const { isAdmin, isOwner } = useAuth();
  const canManageAttachments = isAdmin || isOwner;
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const initRef = useRef(false);
  const skipDirtyRef = useRef(true);

  useFormGuard(dirty);

  useEffect(() => {
    (async () => {
      skipDirtyRef.current = true;
      const { data } = await supabase
        .from(tbl("stores") as any)
        .select("name,tax_id,phone,address,logo_url,stamp_url,signature_url,footer_text,default_vat_rate,vat_enabled,brand_color,attach_biz_reg_url,attach_id_copy_url,attach_bankbook_url")
        .eq("id", storeId)
        .maybeSingle();
      // Check for an unsaved draft first
      try {
        const draft = await loadDraft(storeId, "settings");
        if (draft && draftHasContent("settings", draft)) {
          setForm(draft);
          setHasDraft(true);
          setDirty(true);
          toast.info("กู้คืนข้อมูลตั้งค่าที่ยังไม่ได้บันทึก");
        } else {
          setForm(data);
        }
      } catch {
        setForm(data);
      }
      setTimeout(() => { skipDirtyRef.current = false; initRef.current = true; }, 0);
    })();
  }, [storeId]);

  // Autosave draft on edit
  useEffect(() => {
    if (!form || !initRef.current || skipDirtyRef.current) return;
    setDirty(true);
    const h = window.setTimeout(async () => {
      const result = await saveDraft(storeId, "settings", form);
      if (!result.synced && result.local) {
        toast.warning("เก็บร่างการตั้งค่าไว้ในเครื่องแล้ว — ยังซิงก์ขึ้นระบบไม่ได้");
      }
    }, 800);
    return () => window.clearTimeout(h);
  }, [form, storeId]);

  async function discardDraft() {
    skipDirtyRef.current = true;
    await clearDraft(storeId, "settings").catch(() => {});
    const { data } = await supabase
      .from(tbl("stores") as any)
      .select("name,tax_id,phone,address,logo_url,stamp_url,signature_url,footer_text,default_vat_rate,vat_enabled,brand_color,attach_biz_reg_url,attach_id_copy_url,attach_bankbook_url")
      .eq("id", storeId)
      .maybeSingle();
    setForm(data);
    setHasDraft(false);
    setDirty(false);
    setTimeout(() => { skipDirtyRef.current = false; }, 0);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from(tbl("stores") as any).update(form).eq("id", storeId);
    setSaving(false);
    if (error) {
      // keep form + draft intact so the user can fix the error and retry
      toast.error(`บันทึกไม่สำเร็จ: ${error.message}`);
    } else {
      toast.success("บันทึกแล้ว");
      await clearDraft(storeId, "settings").catch(() => {});
      setHasDraft(false);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["rds_stores"] });
    }
  }

  if (!form) return <p className="text-sm text-muted-foreground p-4">กำลังโหลด...</p>;

  return (
    <Card className="p-5 space-y-4 mt-4">
      {hasDraft && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 p-3 text-sm flex items-center justify-between gap-3">
          <span>กำลังแก้ไขร่างที่ยังไม่ได้บันทึก ข้อมูลของคุณจะถูกเก็บไว้แม้รีเฟรช</span>
          <Button size="sm" variant="outline" onClick={discardDraft}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> ยกเลิกร่าง
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="ชื่อร้าน"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="เลขผู้เสียภาษี"><Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></Field>
        <Field label="เบอร์โทร"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="VAT (%)"><Input type="number" step="0.01" value={form.default_vat_rate ?? 0} onChange={(e) => setForm({ ...form, default_vat_rate: Number(e.target.value) })} /></Field>
        <div className="space-y-1 md:col-span-2">
          <Label>โลโก้ร้าน</Label>
          <LogoUploader
            storeId={storeId}
            url={form.logo_url ?? ""}
            onChange={(url) => setForm({ ...form, logo_url: url })}
          />
        </div>
        <Field label="URL ตราประทับ"><Input value={form.stamp_url ?? ""} onChange={(e) => setForm({ ...form, stamp_url: e.target.value })} /></Field>
        <Field label="URL ลายเซ็น"><Input value={form.signature_url ?? ""} onChange={(e) => setForm({ ...form, signature_url: e.target.value })} /></Field>
        <div className="space-y-1 md:col-span-2">
          <Label>สีหลักของแบรนด์ (ใช้ในใบเสร็จ/เอกสาร)</Label>
          <BrandColorPicker
            value={form.brand_color ?? ""}
            onChange={(v) => setForm({ ...form, brand_color: v })}
          />
        </div>
        <div className="space-y-1">
          <Label>เปิดใช้ VAT</Label>
          <div className="h-10 flex items-center gap-2">
            <Switch checked={!!form.vat_enabled} onCheckedChange={(v) => setForm({ ...form, vat_enabled: v })} />
            <span className="text-sm">{form.vat_enabled ? "เปิด" : "ปิด"}</span>
          </div>
        </div>
      </div>
      <Field label="ที่อยู่"><Textarea rows={3} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="ข้อความท้ายเอกสาร"><Textarea rows={2} value={form.footer_text ?? ""} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} /></Field>
      <div className="border-t border-border pt-4 space-y-3">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            เอกสารแนบร้าน
            {!canManageAttachments && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <p className="text-xs text-muted-foreground">
            {canManageAttachments
              ? "อัปโหลดครั้งเดียว ระบบจะจำไว้ให้เลือกแนบตอนออกเอกสารได้ (รองรับ PNG, JPG, PDF ≤ 5MB)"
              : "เฉพาะแอดมิน/เจ้าของร้านเท่านั้นที่สามารถดูและดาวน์โหลดไฟล์เอกสารแนบของร้านได้"}
          </p>
        </div>
        {canManageAttachments ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AttachmentUploader
            label="ใบทะเบียนพาณิชย์"
            storeId={storeId}
            kind="biz-reg"
            url={form.attach_biz_reg_url ?? ""}
            onChange={(url) => setForm({ ...form, attach_biz_reg_url: url })}
          />
          <AttachmentUploader
            label="สำเนาบัตรประชาชน"
            storeId={storeId}
            kind="id-copy"
            url={form.attach_id_copy_url ?? ""}
            onChange={(url) => setForm({ ...form, attach_id_copy_url: url })}
          />
          <AttachmentUploader
            label="สำเนาบัญชีธนาคาร"
            storeId={storeId}
            kind="bankbook"
            url={form.attach_bankbook_url ?? ""}
            onChange={(url) => setForm({ ...form, attach_bankbook_url: url })}
          />
        </div>
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> บันทึก</Button>
      </div>
    </Card>
  );
}

function AttachmentUploader({
  label,
  storeId,
  kind,
  url,
  onChange,
}: {
  label: string;
  storeId: string;
  kind: string;
  url: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPdf = /\.pdf(\?|$)/i.test(url);
  async function onPick(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const newUrl = await uploadStoreAttachment(storeId, file, kind);
      onChange(newUrl);
      toast.success(`อัปโหลด${label}สำเร็จ — อย่าลืมกดบันทึก`);
    } catch (e: any) {
      toast.error(e?.message ?? "อัปโหลดล้มเหลว");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="h-24 rounded-md border border-border bg-muted/40 flex items-center justify-center overflow-hidden">
        {url ? (
          isPdf ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
              onClick={() => { void logAttachmentAccess(storeId, kind, "store_attachment_view"); }}
            >
              เปิดดู PDF
            </a>
          ) : (
            <img
              src={url}
              alt={label}
              className="max-w-full max-h-full object-contain"
              onLoad={() => { void logAttachmentAccess(storeId, kind, "store_attachment_view"); }}
            />
          )
        ) : (
          <span className="text-xs text-muted-foreground">ยังไม่มีไฟล์</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "กำลังอัปโหลด..." : url ? "เปลี่ยนไฟล์" : "เลือกไฟล์"}
        </Button>
        {url && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void logAttachmentAccess(storeId, kind, "store_attachment_download");
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            disabled={busy}
          >
            ดาวน์โหลด
          </Button>
        )}
        {url && (
          <Button size="sm" variant="ghost" onClick={() => onChange("")} disabled={busy}>
            ลบ
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf,.pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}

function LogoUploader({ storeId, url, onChange }: { storeId: string; url: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function onPick(file: File | null) {
    if (!file) return;
    // Pre-validate before upload so user sees instant feedback
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    const okExt = /\.(png|jpe?g)$/i.test(file.name);
    if (!allowed.includes(file.type) && !okExt) {
      toast.error("รองรับเฉพาะไฟล์ PNG หรือ JPG เท่านั้น");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(`ไฟล์ใหญ่เกิน 2MB (ไฟล์นี้ ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const newUrl = await uploadStoreLogo(storeId, file);
      onChange(newUrl);
      toast.success("อัปโหลดโลโก้สำเร็จ — อย่าลืมกดบันทึก");
    } catch (e: any) {
      toast.error(e?.message ?? "อัปโหลดล้มเหลว");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <div className="flex items-start gap-3">
      <div className="w-20 h-20 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
        {url ? (
          <img src={url} alt="โลโก้ร้าน" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">ไม่มี</span>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "กำลังอัปโหลด…" : url ? "เปลี่ยนโลโก้" : "อัปโหลดจากเครื่อง"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> ลบ
            </Button>
          )}
        </div>
        <Input
          placeholder="หรือวาง URL โลโก้"
          value={url}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">รองรับเฉพาะ PNG หรือ JPG ขนาดไม่เกิน 2MB</p>
      </div>
    </div>
  );
}

function BrandColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {BRAND_PRESETS.map((p) => {
          const active = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${active ? "border-foreground" : "border-border hover:border-foreground/40"}`}
            >
              <span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: p.swatch }} />
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="กำหนดเอง: H S% L% เช่น 200 80% 45%"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
        <div className="h-9 w-9 rounded-md border border-border" style={{ backgroundColor: value ? `hsl(${value})` : "transparent" }} />
      </div>
    </div>
  );
}

function previewDocNo(prefix: string, format: string) {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  let r = (format || "{prefix}{yyyy}{mm}-{seq:0000}").replace("{prefix}", prefix || "");
  r = r.replace("{yyyy}", yyyy).replace("{mm}", mm);
  const m = r.match(/\{seq:(0+)\}/);
  if (m) r = r.replace(/\{seq:0+\}/, "1".padStart(m[1].length, "0"));
  r = r.replace("{seq}", "1");
  return r;
}

function DocSettingsTab({ storeId }: { storeId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ["rds_document_settings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("document_settings") as any)
        .select("*")
        .eq("store_id", storeId)
        .order("document_type");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(data ? data.map((r) => ({ ...r })) : null);
  }, [data]);

  async function save(r: any) {
    const { error } = await supabase
      .from(tbl("document_settings") as any)
      .update({
        prefix: r.prefix,
        running_format: r.running_format,
        next_number: Number(r.next_number) || 1,
        paper_size: r.paper_size,
      })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("บันทึกแล้ว"); refetch(); }
  }

  if (!rows) return <p className="text-sm text-muted-foreground p-4">กำลังโหลด...</p>;
  return (
    <Card className="p-5 space-y-4 mt-4">
      {rows.map((r, i) => (
        <div key={r.id} className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{TH_TYPES[r.document_type] ?? r.document_type}</p>
            <Button size="sm" onClick={() => save(r)}>บันทึก</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="คำนำหน้า">
              <Input value={r.prefix ?? ""} onChange={(e) => { const c = [...rows]; c[i] = { ...r, prefix: e.target.value }; setRows(c); }} />
            </Field>
            <Field label="รูปแบบ {prefix}{yyyy}{mm}-{seq:0000}">
              <Input value={r.running_format ?? ""} onChange={(e) => { const c = [...rows]; c[i] = { ...r, running_format: e.target.value }; setRows(c); }} />
            </Field>
            <Field label="เลขถัดไป">
              <Input type="number" value={r.next_number ?? 1} onChange={(e) => { const c = [...rows]; c[i] = { ...r, next_number: Number(e.target.value) }; setRows(c); }} />
            </Field>
            <Field label="ขนาดกระดาษ">
              <Input value={r.paper_size ?? "A4"} onChange={(e) => { const c = [...rows]; c[i] = { ...r, paper_size: e.target.value }; setRows(c); }} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">ตัวอย่าง: <span className="font-mono">{previewDocNo(r.prefix ?? "", r.running_format ?? "")}</span></p>
        </div>
      ))}
    </Card>
  );
}

function SimpleListTab({ storeId, table, title, hasSort }: { storeId: string; table: string; title: string; hasSort?: boolean }) {
  const qc = useQueryClient();
  const key = [table, storeId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const cols = hasSort ? "id,name,is_active,sort_order" : "id,name";
      let q = supabase.from(table as any).select(cols).eq("store_id", storeId);
      q = hasSort ? q.order("sort_order") : q.order("name");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const payload: any = { store_id: storeId, name: name.trim() };
    if (hasSort) { payload.is_active = true; payload.sort_order = (data?.length ?? 0) + 1; }
    const { error } = await supabase.from(table as any).insert(payload);
    if (error) toast.error(error.message);
    else { setName(""); toast.success("เพิ่มแล้ว"); qc.invalidateQueries({ queryKey: key }); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: key });
  }
  async function toggle(r: any) {
    if (!hasSort) return;
    const { error } = await supabase.from(table as any).update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: key });
  }

  return (
    <Card className="p-5 space-y-4 mt-4">
      <p className="font-medium">{title}</p>
      <div className="flex gap-2">
        <Input placeholder={`เพิ่ม${title}ใหม่`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> เพิ่ม</Button>
      </div>
      <div className="divide-y divide-border">
        {(data ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2">
            <span>{r.name}</span>
            <div className="flex items-center gap-2">
              {hasSort && <Switch checked={!!r.is_active} onCheckedChange={() => toggle(r)} />}
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีข้อมูล</p>}
      </div>
    </Card>
  );
}

function TaxRatesTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const key = ["rds_tax_rates", storeId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("tax_rates") as any)
        .select("id,label,rate")
        .eq("store_id", storeId)
        .order("rate");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [label, setLabel] = useState("");
  const [rate, setRate] = useState<number>(7);

  async function add() {
    if (!label.trim()) return;
    const { error } = await supabase.from(tbl("tax_rates") as any).insert({
      store_id: storeId, label: label.trim(), rate: Number(rate) || 0,
    });
    if (error) toast.error(error.message);
    else { setLabel(""); setRate(7); toast.success("เพิ่มแล้ว"); qc.invalidateQueries({ queryKey: key }); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from(tbl("tax_rates") as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: key });
  }

  return (
    <Card className="p-5 space-y-4 mt-4">
      <p className="font-medium">อัตราภาษี</p>
      <div className="flex gap-2">
        <Input placeholder="ป้ายชื่อ เช่น VAT" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
        <Input type="number" step="0.01" placeholder="%" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-24" />
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> เพิ่ม</Button>
      </div>
      <div className="divide-y divide-border">
        {(data ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2">
            <span>{r.label} <span className="text-muted-foreground">({r.rate}%)</span></span>
            <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีอัตราภาษี</p>}
      </div>
    </Card>
  );
}

function GoogleTab({ storeId }: { storeId: string }) {
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [autoUpload, setAutoUpload] = useState<boolean>(
    () => (typeof window !== "undefined" ? localStorage.getItem("rds_auto_upload_pdf") !== "0" : true),
  );
  const qc = useQueryClient();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from(tbl("stores") as any)
        .select("google_sheet_id,google_drive_folder_id,drive_root_folder_id,drive_orders_folder_id,drive_quotes_folder_id,drive_receipts_folder_id,name,slug")
        .eq("id", storeId)
        .maybeSingle();
      setForm(data);
    })();
  }, [storeId]);

  const statusQ = useQuery({
    queryKey: ["rds_sync_status", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id,document_no,document_type,google_sheet_sync_status,google_drive_sync_status,last_sync_error,google_sheet_synced_at,google_drive_synced_at")
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = liveChannel(`rds_sync_${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tbl("documents"), filter: `store_id=eq.${storeId}` }, () => {
        qc.invalidateQueries({ queryKey: ["rds_sync_status", storeId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId, qc]);

  const rows = statusQ.data ?? [];
  const stats = rows.reduce(
    (m, r) => {
      const s = r.google_sheet_sync_status;
      const d = r.google_drive_sync_status;
      if (s === "success") m.sheet.ok++;
      else if (s === "failed") m.sheet.fail++;
      else if (s === "pending") m.sheet.pending++;
      if (d === "success") m.drive.ok++;
      else if (d === "failed") m.drive.fail++;
      else if (d === "pending") m.drive.pending++;
      return m;
    },
    { sheet: { ok: 0, fail: 0, pending: 0 }, drive: { ok: 0, fail: 0, pending: 0 } },
  );
  const failedRows = rows.filter(
    (r) => r.google_sheet_sync_status === "failed" || r.google_drive_sync_status === "failed",
  ).slice(0, 20);

  async function retryOne(r: any) {
    const targets: Array<"sheet" | "drive"> = [];
    if (r.google_sheet_sync_status === "failed") targets.push("sheet");
    if (r.google_drive_sync_status === "failed") targets.push("drive");
    const target = targets.length === 2 ? "both" : targets[0];
    if (!target) return;
    const { ok } = await triggerSync([r.id], target as any);
    if (ok) toast.success(`ลองใหม่ ${r.document_no} สำเร็จ`);
    else toast.error(`ลองใหม่ ${r.document_no} ไม่สำเร็จ`);
    qc.invalidateQueries({ queryKey: ["rds_sync_status", storeId] });
  }

  async function retryAll() {
    if (!failedRows.length) return;
    toast.info(`ลองใหม่ ${failedRows.length} ฉบับ...`);
    let okCount = 0;
    for (const r of failedRows) {
      const targets: Array<"sheet" | "drive"> = [];
      if (r.google_sheet_sync_status === "failed") targets.push("sheet");
      if (r.google_drive_sync_status === "failed") targets.push("drive");
      const target = targets.length === 2 ? "both" : targets[0];
      try {
        const { ok } = await triggerSync([r.id], target as any);
        if (ok) okCount++;
      } catch { /* noop */ }
    }
    toast.success(`สำเร็จ ${okCount}/${failedRows.length}`);
    qc.invalidateQueries({ queryKey: ["rds_sync_status", storeId] });
  }

  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ scope: string; done: number; total: number; ok: number; failed: number } | null>(null);
  const [authErrorScope, setAuthErrorScope] = useState<"store" | "all_stores" | null>(null);
  const [lastCall, setLastCall] = useState<{
    at: string;
    scope: string;
    status: "ok" | "error" | "unauthorized";
    message?: string;
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  async function syncAllNow(scope: "store" | "all_stores") {
    if (syncingAll) return;
    const label = scope === "all_stores" ? "ทุกร้าน" : "ร้านนี้";
    if (!confirm(`ซิงค์เอกสารทั้งหมดของ${label}เข้า Google Sheets + Drive อีกครั้ง?\n(ระบบจะข้ามไฟล์ที่มีอยู่แล้วในโฟลเดอร์ปลายทาง)`)) return;
    setSyncingAll(true);
    setSyncAllProgress({ scope: label, done: 0, total: 0, ok: 0, failed: 0 });
    try {
      let q = supabase
        .from(tbl("documents") as any)
        .select("id")
        .is("deleted_at", null)
        .in("document_type", ["quotation", "delivery", "receipt"])
        .order("created_at", { ascending: false });
      if (scope === "store") q = q.eq("store_id", storeId);
      const { data } = await q;
      const list = (data as any[]) ?? [];
      setSyncAllProgress((p) => ({ ...(p ?? { scope: label, done: 0, total: 0, ok: 0, failed: 0 }), total: list.length }));
      const ids = list.map((r) => r.id);
      // Chunk to keep UI responsive.
      const CHUNK = 5;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const results = await Promise.all(
          chunk.map((id) =>
            triggerSync([id], "both")
              .then((r) => r.ok)
              .catch((e) => {
                if (e instanceof SyncAuthError) throw e;
                return false;
              }),
          ),
        );
        setSyncAllProgress((p) => {
          const c = p ?? { scope: label, done: 0, total: ids.length, ok: 0, failed: 0 };
          const ok = results.filter(Boolean).length;
          return {
            ...c,
            done: c.done + results.length,
            ok: c.ok + ok,
            failed: c.failed + (results.length - ok),
          };
        });
      }
      toast.success(`ซิงค์ ${label} เรียบร้อย`);
      setLastCall({
        at: new Date().toISOString(),
        scope: `ซิงค์${label}`,
        status: "ok",
        message: `สำเร็จ ${ids.length} รายการ`,
      });
      qc.invalidateQueries({ queryKey: ["rds_sync_status", storeId] });
    } catch (e) {
      if (e instanceof SyncAuthError) {
        setAuthErrorScope(scope);
        setLastCall({
          at: new Date().toISOString(),
          scope: `ซิงค์${label}`,
          status: "unauthorized",
          message: "Session หมดอายุ (401 unauthorized)",
        });
      } else {
        const msg = (e as Error)?.message ?? "unknown";
        toast.error(`ซิงค์ล้มเหลว: ${msg}`);
        setLastCall({
          at: new Date().toISOString(),
          scope: `ซิงค์${label}`,
          status: "error",
          message: msg,
        });
      }
    } finally {
      setSyncingAll(false);
    }
  }

  // Auto-resume sync after re-login (?resume_sync=store|all_stores).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const scope = params.get("resume_sync");
    if (scope !== "store" && scope !== "all_stores") return;
    // Strip the flag so a refresh doesn't loop.
    params.delete("resume_sync");
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    setTimeout(() => syncAllNow(scope), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAutoUpload(v: boolean) {
    setAutoUpload(v);
    localStorage.setItem("rds_auto_upload_pdf", v ? "1" : "0");
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from(tbl("stores") as any).update(form).eq("id", storeId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("บันทึกแล้ว");
  }

  async function testSync() {
    setTesting(true);
    try {
      const { data: d } = await supabase
        .from(tbl("documents") as any)
        .select("id")
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!d) { toast.error("ยังไม่มีเอกสารให้ทดสอบ"); return; }
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { document_id: (d as any).id, target: "sheet" },
      });
      const unauthorized =
        (error as any)?.status === 401 ||
        (data as any)?.error === "unauthorized";
      if (unauthorized) {
        setLastCall({
          at: new Date().toISOString(),
          scope: "ทดสอบ Sync",
          status: "unauthorized",
          message: "Session หมดอายุ (401 unauthorized)",
        });
        setAuthErrorScope("store");
        return;
      }
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success("ทดสอบ sync Google Sheets สำเร็จ");
        setLastCall({
          at: new Date().toISOString(),
          scope: "ทดสอบ Sync",
          status: "ok",
          message: "Google Sheets ตอบรับปกติ",
        });
      } else {
        const msg = (data as any)?.errors?.join(", ") ?? "unknown";
        toast.error("ทดสอบไม่สำเร็จ: " + msg);
        setLastCall({
          at: new Date().toISOString(),
          scope: "ทดสอบ Sync",
          status: "error",
          message: msg,
        });
      }
    } catch (e: any) {
      const msg = e?.message ?? "ทดสอบไม่สำเร็จ";
      toast.error(msg);
      setLastCall({
        at: new Date().toISOString(),
        scope: "ทดสอบ Sync",
        status: "error",
        message: msg,
      });
    } finally { setTesting(false); }
  }

  if (!form) return <p className="text-sm text-muted-foreground p-4">กำลังโหลด...</p>;
  return (
    <div className="space-y-4 mt-4">
    <PerStoreSyncStatusCard />
    <GoogleDriveStatusCard storeId={storeId} />
    <SyncAutoRetryCard storeId={storeId} />
    <BackfillDriveCard storeId={storeId} storeSlug={form?.slug ?? null} />
    <Card className="p-5 space-y-4">
      <Field label="Google Sheet ID">
        <Input value={form.google_sheet_id ?? ""} onChange={(e) => setForm({ ...form, google_sheet_id: e.target.value })} placeholder="เช่น 1AbCdEfG..." />
      </Field>
      <Field label="Google Drive Folder ID">
        <Input value={form.google_drive_folder_id ?? ""} onChange={(e) => setForm({ ...form, google_drive_folder_id: e.target.value })} />
      </Field>
      <div className="rounded-lg border border-dashed p-3 space-y-3 bg-muted/20">
        <p className="text-xs font-medium">โฟลเดอร์แยกตามประเภทเอกสาร (ของร้าน{form.name ? ` "${form.name}"` : ""})</p>
        <Field label="Root folder (ค่าเริ่มต้นเมื่อไม่ระบุประเภท)">
          <Input value={form.drive_root_folder_id ?? ""} onChange={(e) => setForm({ ...form, drive_root_folder_id: e.target.value })} placeholder="วางลิงก์โฟลเดอร์หรือ ID" />
        </Field>
        <Field label="โฟลเดอร์สำหรับไฟล์ออเดอร์">
          <Input value={form.drive_orders_folder_id ?? ""} onChange={(e) => setForm({ ...form, drive_orders_folder_id: e.target.value })} placeholder="ORDERS/..." />
        </Field>
        <Field label="โฟลเดอร์สำหรับใบเสนอราคา">
          <Input value={form.drive_quotes_folder_id ?? ""} onChange={(e) => setForm({ ...form, drive_quotes_folder_id: e.target.value })} placeholder="QUOTES/..." />
        </Field>
        <Field label="โฟลเดอร์สำหรับใบเสร็จ / ใบส่งของ / ใบกำกับ">
          <Input value={form.drive_receipts_folder_id ?? ""} onChange={(e) => setForm({ ...form, drive_receipts_folder_id: e.target.value })} placeholder="RECEIPTS/..." />
        </Field>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          ไฟล์ของแต่ละร้านจะถูกเก็บแยกโฟลเดอร์ทั้งหมด ระบบจะไม่ปนไฟล์ข้ามร้าน หากช่องใดเว้นว่าง จะใช้ Root folder แทน · Token / secret ทั้งหมดถูกเก็บฝั่ง server เท่านั้น
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={autoUpload} onCheckedChange={toggleAutoUpload} />
        <Label className="!mb-0">อัปโหลด PDF ขึ้น Google Drive อัตโนมัติเมื่อบันทึกเอกสาร</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        เชื่อมต่อด้วย Lovable connector — แต่ละร้านส่งเอกสารเข้า Sheet/Drive แยกตามค่าด้านบน กดทดสอบเพื่อตรวจสอบการเชื่อมต่อ
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={testSync} disabled={testing}>{testing ? "กำลังทดสอบ..." : "ทดสอบ Sync"}</Button>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> บันทึก</Button>
      </div>
      {lastCall && (
        <div
          className={`rounded-lg border p-3 text-xs space-y-2 ${
            lastCall.status === "ok"
              ? "border-green-300 bg-green-50 dark:bg-green-950/20"
              : lastCall.status === "unauthorized"
              ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {lastCall.status === "ok" && <span className="text-green-700 dark:text-green-400">✓ สำเร็จ</span>}
                {lastCall.status === "error" && <span className="text-destructive">✗ ล้มเหลว</span>}
                {lastCall.status === "unauthorized" && <span className="text-amber-700 dark:text-amber-400">🔒 Session หมดอายุ</span>}
                {" · "}
                <span className="text-muted-foreground">{lastCall.scope}</span>
                {" · "}
                <span className="text-muted-foreground">{new Date(lastCall.at).toLocaleString("th-TH")}</span>
              </div>
              {lastCall.message && (
                <div className="text-muted-foreground mt-1 break-all line-clamp-3">{lastCall.message.slice(0, 200)}</div>
              )}
              {lastCall.status === "error" && /ไม่พบ Google Sheet/.test(lastCall.message ?? "") && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-background p-2 text-[11px] space-y-1">
                  <p className="font-medium text-destructive">วิธีแก้:</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>ตรวจสอบ <b>Google Sheet ID</b> ในกล่องด้านบนว่าตรงกับ URL จริง (คัดลอกจาก URL ระหว่าง <code>/d/</code> ถึง <code>/edit</code>)</li>
                    <li>เปิด Sheet ใน Google แล้วกด <b>Share</b> → ให้สิทธิ์ <b>Editor</b> กับบัญชี Google ที่เชื่อมไว้กับ Lovable connector</li>
                    <li>บันทึกค่าแล้วกด "ทดสอบ Sync" อีกครั้ง</li>
                  </ol>
                </div>
              )}
              {lastCall.status === "error" && /ไม่มีสิทธิ์เข้าถึง/.test(lastCall.message ?? "") && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-background p-2 text-[11px] space-y-1">
                  <p className="font-medium text-destructive">วิธีแก้:</p>
                  <p className="text-muted-foreground">เปิด Google Sheet แล้วกด <b>Share</b> เพิ่มสิทธิ์ <b>Editor</b> ให้บัญชี Google ที่ใช้เชื่อมกับ Lovable connector จากนั้นทดสอบซิงก์อีกครั้ง</p>
                </div>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              {lastCall.status === "unauthorized" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await supabase.auth.refreshSession();
                      syncAllNow("store");
                    }}
                    disabled={syncingAll}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> รีเฟรช session แล้วลอง
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const resumeTo = `${location.pathname}?resume_sync=store`;
                      navigate(`/login?next=${encodeURIComponent(resumeTo)}`);
                    }}
                  >
                    เข้าสู่ระบบใหม่
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncAllNow("store")}
                  disabled={syncingAll}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncingAll ? "animate-spin" : ""}`} /> ลองซิงค์ใหม่
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>

    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">สถานะการ Sync ล่าสุด</p>
          <p className="text-xs text-muted-foreground">อัปเดตแบบเรียลไทม์จากเอกสารของร้านนี้</p>
        </div>
        <Button variant="outline" size="sm" onClick={retryAll} disabled={!failedRows.length}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> ลองใหม่ทั้งหมด ({failedRows.length})
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Google Sheets</p>
          <p>สำเร็จ: <span className="font-medium text-foreground">{stats.sheet.ok}</span> · รอ: {stats.sheet.pending} · ล้มเหลว: <span className="text-destructive">{stats.sheet.fail}</span></p>
        </div>
        <div className="border border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Google Drive</p>
          <p>สำเร็จ: <span className="font-medium text-foreground">{stats.drive.ok}</span> · รอ: {stats.drive.pending} · ล้มเหลว: <span className="text-destructive">{stats.drive.fail}</span></p>
        </div>
      </div>
      {failedRows.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="text-left p-2">เลขที่</th>
                <th className="text-left p-2">Sheet</th>
                <th className="text-left p-2">Drive</th>
                <th className="text-left p-2">Error</th>
                <th className="text-right p-2">การทำงาน</th>
              </tr>
            </thead>
            <tbody>
              {failedRows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 font-mono">{r.document_no}</td>
                  <td className="p-2">{r.google_sheet_sync_status ?? "—"}</td>
                  <td className="p-2">{r.google_drive_sync_status ?? "—"}</td>
                  <td className="p-2 text-muted-foreground truncate max-w-[280px]" title={r.last_sync_error ?? ""}>
                    {r.last_sync_error ?? "—"}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => retryOne(r)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> ลองใหม่
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-3">ไม่มีรายการที่ล้มเหลว</p>
      )}
    </Card>

    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">ซิงค์เอกสารทั้งหมดตอนนี้</p>
          <p className="text-xs text-muted-foreground">
            ส่งเอกสาร <b>ใบเสนอราคา · ใบส่งของ · ใบเสร็จรับเงิน</b> เข้า Google Sheets และโฟลเดอร์ที่ถูกต้องอีกครั้ง
            เพื่อกันการหลงลืมว่าซิงค์ไปแล้วหรือยัง — ใช้ได้ทั้งเฉพาะร้านนี้และทั้งสองร้าน
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => syncAllNow("store")} disabled={syncingAll}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
            ซิงค์ร้านนี้
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncAllNow("all_stores")} disabled={syncingAll}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncingAll ? "animate-spin" : ""}`} />
            ซิงค์ทั้ง 2 ร้าน
          </Button>
        </div>
      </div>
      {syncAllProgress && (
        <div className="text-xs text-muted-foreground border border-border rounded-lg p-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>ขอบเขต: <b className="text-foreground">{syncAllProgress.scope}</b></div>
          <div>ทั้งหมด: <b className="text-foreground">{syncAllProgress.total}</b></div>
          <div>เสร็จ: <b className="text-foreground">{syncAllProgress.done}</b> / สำเร็จ {syncAllProgress.ok}</div>
          <div>ล้มเหลว: <b className={syncAllProgress.failed ? "text-destructive" : "text-foreground"}>{syncAllProgress.failed}</b></div>
        </div>
      )}
    </Card>

    <FolderMappingCard storeId={storeId} />
    <AccessTestCard storeId={storeId} />
    <OrganizeAllFilesCard storeId={storeId} />
    <AlertDialog open={!!authErrorScope} onOpenChange={(o) => { if (!o) setAuthErrorScope(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session หมดอายุ</AlertDialogTitle>
          <AlertDialogDescription>
            เซิร์ฟเวอร์ปฏิเสธการซิงค์ (401 unauthorized) — กรุณาเข้าสู่ระบบใหม่แล้วเราจะซิงค์ต่อให้อัตโนมัติ
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setAuthErrorScope(null)}>ปิด</AlertDialogCancel>
          <Button
            variant="outline"
            onClick={async () => {
              const scope = authErrorScope;
              setAuthErrorScope(null);
              await supabase.auth.refreshSession();
              if (scope) syncAllNow(scope);
            }}
          >
            ลองอีกครั้ง
          </Button>
          <AlertDialogAction
            onClick={() => {
              const scope = authErrorScope ?? "store";
              const resumeTo = `${location.pathname}?resume_sync=${scope}`;
              navigate(`/login?next=${encodeURIComponent(resumeTo)}`);
            }}
          >
            เข้าสู่ระบบใหม่
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>
  );
}

function FolderMappingCard({ storeId }: { storeId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  useEffect(() => {
    supabase.from(tbl("stores") as any).select("slug").eq("id", storeId).maybeSingle()
      .then(({ data }) => setStoreSlug((data as any)?.slug ?? null));
  }, [storeId]);
  const isColorlab = storeSlug === "colorlab";
  const expected = isColorlab
    ? [
        { doc_type: "quotation", label: "ใบเสนอราคา" },
        { doc_type: "delivery", label: "ใบส่งของ" },
        { doc_type: "receipt", label: "ใบเสร็จรับเงิน/ใบกำกับภาษี" },
      ]
    : [
        { doc_type: "quotation", label: "ใบเสนอราคา" },
        { doc_type: "delivery", label: "ใบส่งของ" },
        { doc_type: "receipt", label: "ใบเสร็จรับเงิน" },
      ];

  async function probe() {
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "probe_folders", store_id: storeId },
      });
      if (error) throw error;
      setResult(data);
      if ((data as any)?.ok) toast.success("แมปโฟลเดอร์ถูกต้อง");
      else toast.warning("พบข้อผิดพลาดบางส่วน — ดูรายละเอียดในตาราง");
    } catch (e: any) {
      toast.error(e.message ?? "ทดสอบไม่สำเร็จ");
      setResult({ ok: false, error: e.message });
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium flex items-center gap-2"><FolderCheck className="h-4 w-4" /> ทดสอบการแมปโฟลเดอร์ Google Drive</p>
          <p className="text-xs text-muted-foreground">
            ตรวจว่าเอกสาร <b>1. ใบเสนอราคา</b> · <b>2. ใบส่งของ</b> · <b>3. {expected[2].label}</b> ถูกส่งเข้าโฟลเดอร์ที่ถูกต้อง
            (ร้าน{isColorlab ? "คัลเลอร์แล็ป" : "การพิมพ์"})
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={probe} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "กำลังทดสอบ..." : "ทดสอบการแมป"}
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-10">#</th>
              <th className="text-left p-2">ประเภทเอกสาร</th>
              <th className="text-left p-2">ชื่อโฟลเดอร์ที่คาดหวัง</th>
              <th className="text-left p-2">สถานะ</th>
              <th className="text-right p-2">เปิด Drive</th>
            </tr>
          </thead>
          <tbody>
            {expected.map((e, i) => {
              const r = result?.results?.find((x: any) => x.doc_type === e.doc_type);
              return (
                <tr key={e.doc_type} className="border-t border-border">
                  <td className="p-2 font-mono">{i + 1}</td>
                  <td className="p-2">{e.doc_type}</td>
                  <td className="p-2">{e.label}</td>
                  <td className="p-2">
                    {!result && <span className="text-muted-foreground">—</span>}
                    {r?.error && <span className="text-destructive" title={r.error}>ผิดพลาด</span>}
                    {r && !r.error && (r.created ? <span className="text-amber-600">สร้างใหม่</span> : <span className="text-emerald-600">พบแล้ว</span>)}
                  </td>
                  <td className="p-2 text-right">
                    {r?.folder_url && (
                      <a href={r.folder_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        เปิด <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result?.root_folder_id && (
        <p className="text-xs text-muted-foreground">
          โฟลเดอร์หลักของร้าน:{" "}
          <a href={result.root_folder_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {result.root_folder_id}
          </a>
          {result.root_folder_created && <span className="ml-1 text-amber-600">(เพิ่งสร้างให้)</span>}
        </p>
      )}
      {result?.error && (
        <p className="text-xs text-destructive">ข้อผิดพลาด: {result.error}</p>
      )}

      <div className="pt-1">
        <RouterLink to="logo-check" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          ตรวจสอบการฝังโลโก้ใน PDF <ExternalLink className="h-3 w-3" />
        </RouterLink>
      </div>
    </Card>
  );
}

function OrganizeAllFilesCard({ storeId }: { storeId: string }) {
  const { slug } = useCurrentStore();
  const [counts, setCounts] = useState<{ total: number; withFile: number; missing: number; pending: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number; failed: number }>({ done: 0, total: 0, ok: 0, failed: 0 });
  const [errors, setErrors] = useState<{ document_no: string; error: string }[]>([]);

  async function loadCounts() {
    const { data, error } = await supabase
      .from(tbl("documents") as any)
      .select("id, google_drive_file_id, google_drive_sync_status")
      .eq("store_id", storeId)
      .is("deleted_at", null);
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as any[];
    const withFile = rows.filter((r) => !!r.google_drive_file_id).length;
    const pending = rows.filter((r) => !r.google_drive_file_id || r.google_drive_sync_status === "pending" || !r.google_drive_sync_status).length;
    setCounts({ total: rows.length, withFile, missing: rows.length - withFile, pending });
  }

  useEffect(() => { loadCounts(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);

  async function organizeAll() {
    setBusy(true);
    setErrors([]);
    try {
      const { data, error } = await supabase
        .from(tbl("documents") as any)
        .select("id, document_no, google_drive_file_id")
        .eq("store_id", storeId)
        .is("deleted_at", null);
      if (error) throw error;
      const allRows = (data ?? []) as any[];
      // Two buckets: existing Drive files get resync_move (rename/move only);
      // missing files get document_full to write the Sheets tab row so the
      // audit trail catches up. PDF re-upload for missing files happens from
      // DocumentsList → "ซิงก์ที่ค้าง" (needs client-side PDF render).
      const rows = allRows.filter((r) => !!r.google_drive_file_id);
      const missingRows = allRows.filter((r) => !r.google_drive_file_id);
      setProgress({ done: 0, total: rows.length + missingRows.length, ok: 0, failed: 0 });

      const concurrency = 3;
      let idx = 0;
      const localErrors: { document_no: string; error: string }[] = [];
      async function worker() {
        while (idx < rows.length) {
          const cur = rows[idx++];
          try {
            const { data: r, error: e } = await supabase.functions.invoke("rds-google-sync", {
              body: { mode: "resync_move", document_id: cur.id },
            });
            if (e) throw e;
            if (r && (r as any).ok === false) throw new Error((r as any).error ?? "resync failed");
            setProgress((p) => ({ ...p, done: p.done + 1, ok: p.ok + 1 }));
          } catch (e: any) {
            localErrors.push({ document_no: cur.document_no, error: e?.message ?? "unknown" });
            setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));

      // Missing-file bucket: sync Sheets tab so those docs are recorded even
      // if Drive PDF re-upload happens later.
      let midx = 0;
      async function missingWorker() {
        while (midx < missingRows.length) {
          const cur = missingRows[midx++];
          try {
            const { data: r, error: e } = await supabase.functions.invoke("rds-google-sync", {
              body: { mode: "document_full", document_id: cur.id, target: "sheet" },
            });
            if (e) throw e;
            if (r && (r as any).ok === false) throw new Error(((r as any).errors ?? []).join(" · ") || "sheet sync failed");
            setProgress((p) => ({ ...p, done: p.done + 1, ok: p.ok + 1 }));
          } catch (e: any) {
            localErrors.push({ document_no: cur.document_no, error: e?.message ?? "unknown" });
            setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + 1 }));
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, missingRows.length) }, missingWorker));

      setErrors(localErrors);
      const totalRun = rows.length + missingRows.length;
      if (localErrors.length === 0) toast.success(`ซิงก์เรียบร้อย ${totalRun} ใบ (ย้าย ${rows.length} · เขียน Sheets ${missingRows.length})`);
      else toast.warning(`ซิงก์เสร็จ ${totalRun - localErrors.length}/${totalRun} — ล้มเหลว ${localErrors.length}`);
      await loadCounts();
    } catch (e: any) {
      toast.error(e?.message ?? "จัดระเบียบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    try { return localStorage.getItem("rds_auto_upload_pdf") !== "0"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("rds_auto_upload_pdf", autoSync ? "1" : "0"); } catch { /* noop */ }
  }, [autoSync]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium flex items-center gap-2"><FolderTree className="h-4 w-4" /> ซิงก์เอกสารทั้งหมดเข้า Google (Drive + Sheets)</p>
          <p className="text-xs text-muted-foreground mt-1">
            รวบไฟล์ PDF ทั้งหมดของร้านนี้เข้าโฟลเดอร์ Google Drive ที่ถูกต้อง (แยกตามประเภทเอกสาร)
            และเขียนแถวสรุปลง Google Sheets ของร้าน — รันซ้ำได้เรื่อยๆ กันไฟล์ตกหล่น
          </p>
        </div>
        <Button onClick={organizeAll} disabled={busy || !counts?.total}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "กำลังซิงก์…" : "ซิงก์ทั้งหมด"}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 bg-muted/30">
        <div>
          <p className="text-sm font-medium">ซิงก์อัตโนมัติหลังบันทึกเอกสาร</p>
          <p className="text-[11px] text-muted-foreground">
            เมื่อกด "บันทึก" ในหน้าเอกสาร ระบบจะสร้าง PDF และอัปโหลดเข้า Google Drive + เขียนแถวลง Sheets ให้ทันที
          </p>
        </div>
        <Switch checked={autoSync} onCheckedChange={setAutoSync} />
      </div>

      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded border border-border p-2">
            <p className="text-muted-foreground">เอกสารทั้งหมด</p>
            <p className="text-lg font-bold text-foreground">{counts.total}</p>
          </div>
          <div className="rounded border border-border p-2">
            <p className="text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> มีไฟล์บน Drive</p>
            <p className="text-lg font-bold text-emerald-600">{counts.withFile}</p>
          </div>
          <div className="rounded border border-border p-2">
            <p className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" /> ยังไม่มีไฟล์</p>
            <p className="text-lg font-bold text-amber-600">{counts.missing}</p>
          </div>
          <div className="rounded border border-border p-2">
            <p className="text-muted-foreground">รอ/ค้างซิงก์</p>
            <p className="text-lg font-bold text-foreground">{counts.pending}</p>
          </div>
        </div>
      )}

      {progress.total > 0 && (
        <div className="space-y-1">
          <Progress value={pct} />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.done} / {progress.total}</span>
            <span>สำเร็จ <b className="text-emerald-600">{progress.ok}</b> · ล้มเหลว <b className={progress.failed ? "text-destructive" : ""}>{progress.failed}</b></span>
          </div>
        </div>
      )}

      {counts && counts.missing > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <p className="text-foreground">
            มีเอกสาร <b>{counts.missing}</b> ใบที่ยังไม่มีไฟล์ PDF บน Drive —
            กด "ซิงก์ทั้งหมด" ด้านบนเพื่อเขียน Sheets ก่อน แล้วเปิดหน้าเอกสารกด{" "}
            <RouterLink2 to={`${storeBasePath(slug)}/documents?sync=pending`} className="text-primary hover:underline">"ซิงก์ที่ค้าง" เพื่ออัปโหลด PDF →</RouterLink2>
          </p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs max-h-40 overflow-auto">
          <p className="font-medium text-destructive mb-1">ล้มเหลว {errors.length} รายการ</p>
          <ul className="space-y-0.5">
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}><span className="font-mono">{e.document_no}</span>: {e.error}</li>
            ))}
            {errors.length > 20 && <li className="text-muted-foreground">…และอีก {errors.length - 20} รายการ</li>}
          </ul>
        </div>
      )}
    </Card>
  );
}

const TEMPLATE_TABS: { key: string; label: string }[] = [
  { key: "modern", label: "ใบเสร็จสมัยใหม่" },
  { key: "classic", label: "คลาสสิก" },
  { key: "compact", label: "กระชับ" },
  { key: "formal", label: "ทางการ" },
];

function DocTemplatesTab({ storeId }: { storeId: string }) {
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="font-semibold">เทมเพลตเอกสาร</h2>
        <p className="text-xs text-muted-foreground">กำหนดข้อความหัวและท้ายเอกสารแยกตามคลาสเทมเพลต</p>
      </div>
      <Tabs defaultValue="modern">
        <TabsList>
          {TEMPLATE_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TEMPLATE_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <DocTemplateEditor storeId={storeId} templateKey={t.key} />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function DocTemplateEditor({ storeId, templateKey }: { storeId: string; templateKey: string }) {
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from(tbl("document_templates") as any)
        .select("header_text, footer_text")
        .eq("store_id", storeId)
        .eq("template_key", templateKey)
        .maybeSingle();
      if (!alive) return;
      setHeader((data as any)?.header_text ?? "");
      setFooter((data as any)?.footer_text ?? "");
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [storeId, templateKey]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from(tbl("document_templates") as any)
      .upsert({ store_id: storeId, template_key: templateKey, header_text: header, footer_text: footer }, { onConflict: "store_id,template_key" });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ: " + error.message); return; }
    toast.success("บันทึกเทมเพลตแล้ว");
  }

  if (!loaded) return <p className="text-sm text-muted-foreground py-3">กำลังโหลด…</p>;

  return (
    <div className="space-y-3 pt-3">
      <div>
        <Label>ข้อความหัวเอกสาร</Label>
        <Textarea
          rows={3}
          placeholder="เช่น สโลแกน หรือ ใบจัดซื้อสำหรับโครงการ…"
          value={header}
          onChange={(e) => setHeader(e.target.value)}
        />
      </div>
      <div>
        <Label>ข้อความท้ายเอกสาร</Label>
        <Textarea
          rows={4}
          placeholder="เช่น เงื่อนไข: ชำระภายใน 30 วัน / ที่อยู่ส่งของ"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
        />
      </div>
      <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">ตัวอย่าง</p>
        {header && <p className="italic text-foreground/70 whitespace-pre-line">{header}</p>}
        <p className="text-muted-foreground">— เนื้อหาเอกสาร —</p>
        {footer && <p className="border-t border-border pt-1 whitespace-pre-line text-foreground/70">{footer}</p>}
      </div>
      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1.5" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
      </Button>
    </div>
  );
}

function DocThemeTab({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [theme, setTheme] = useState<Record<string, { title: string; header: string }> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from(tbl("stores") as any)
        .select("doc_theme")
        .eq("id", storeId)
        .maybeSingle();
      const stored = ((data as any)?.doc_theme ?? {}) as Record<string, { title?: string; header?: string }>;
      const merged: Record<string, { title: string; header: string }> = {};
      for (const t of DOC_TYPE_ORDER) {
        const d = DEFAULT_DOC_THEME[t];
        merged[t] = {
          title: stored[t]?.title || d.title,
          header: stored[t]?.header || d.header,
        };
      }
      setTheme(merged);
    })();
  }, [storeId]);

  function update(t: string, key: "title" | "header", v: string) {
    setTheme((prev) => (prev ? { ...prev, [t]: { ...prev[t], [key]: v } } : prev));
  }
  function resetType(t: string) {
    const d = DEFAULT_DOC_THEME[t];
    setTheme((prev) => (prev ? { ...prev, [t]: { ...d } } : prev));
  }
  function resetAll() {
    const merged: Record<string, { title: string; header: string }> = {};
    for (const t of DOC_TYPE_ORDER) merged[t] = { ...DEFAULT_DOC_THEME[t] };
    setTheme(merged);
  }

  async function save() {
    if (!theme) return;
    setSaving(true);
    const { error } = await supabase
      .from(tbl("stores") as any)
      .update({ doc_theme: theme })
      .eq("id", storeId);
    setSaving(false);
    if (error) toast.error(`บันทึกไม่สำเร็จ: ${error.message}`);
    else {
      toast.success("บันทึกธีมสีเอกสารแล้ว");
      qc.invalidateQueries({ queryKey: ["rds_stores"] });
    }
  }

  if (!theme) return <p className="text-sm text-muted-foreground p-4">กำลังโหลด...</p>;

  return (
    <Card className="p-5 space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">ธีมสีแยกตามประเภทเอกสาร</p>
          <p className="text-xs text-muted-foreground">ปรับสีหัวข้อ (ชื่อเอกสาร / แถบสี / มุมป้าย) และสีหัวตาราง เพื่อให้แยกแยะได้ทันที</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> คืนค่าเริ่มต้นทั้งหมด
        </Button>
      </div>
      <div className="space-y-3">
        {DOC_TYPE_ORDER.map((t) => {
          const v = theme[t];
          return (
            <div key={t} className="border border-border rounded-xl p-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <div>
                <p className="font-medium">{DOC_TYPE_LABEL[t]}</p>
                <div className="mt-2 rounded-md overflow-hidden border border-border w-full max-w-sm">
                  <div className="px-3 py-2 text-white text-sm font-bold" style={{ backgroundColor: v.header }}>
                    ตัวอย่างหัวตาราง
                  </div>
                  <div className="px-3 py-2 text-base font-bold bg-white" style={{ color: v.title }}>
                    {DOC_TYPE_LABEL[t]}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">สีหัวข้อ</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={v.title}
                    onChange={(e) => update(t, "title", e.target.value)}
                    className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer"
                  />
                  <Input value={v.title} onChange={(e) => update(t, "title", e.target.value)} className="font-mono w-28" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">สีหัวตาราง</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={v.header}
                    onChange={(e) => update(t, "header", e.target.value)}
                    className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer"
                  />
                  <Input value={v.header} onChange={(e) => update(t, "header", e.target.value)} className="font-mono w-28" />
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => resetType(t)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> คืนค่าเริ่มต้น
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </Card>
  );
}

// ============================================================
// AccessTestCard — ทดสอบสิทธิ์เข้าถึง Google Sheet + Drive folder
// และ remap ชื่อแท็บ Sheets ต่อประเภทเอกสารได้
// ============================================================
const DOC_TYPES_FOR_MAP: Array<{ key: string; label: string }> = [
  { key: "quotation", label: "ใบเสนอราคา" },
  { key: "delivery", label: "ใบส่งของ" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
  { key: "tax_invoice", label: "ใบกำกับภาษี" },
];

function AccessTestCard({ storeId }: { storeId: string }) {
  const [busy, setBusy] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [tabMap, setTabMap] = useState<Record<string, string>>({});
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [driveFolders, setDriveFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [savingFolderMap, setSavingFolderMap] = useState(false);

  async function runTest() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "test_access", store_id: storeId },
      });
      if (error) throw error;
      setResult(data);
      const m = (data as any)?.sheet_tab_map ?? {};
      setTabMap({
        quotation: m.quotation ?? "",
        delivery: m.delivery ?? "",
        receipt: m.receipt ?? "",
        tax_invoice: m.tax_invoice ?? "",
      });
      const fm = (data as any)?.drive_folder_map ?? {};
      setFolderMap({
        quotation: fm.quotation ?? "",
        delivery: fm.delivery ?? "",
        receipt: fm.receipt ?? "",
        tax_invoice: fm.tax_invoice ?? "",
      });
      if ((data as any)?.ok) toast.success("ตรวจการเข้าถึง Google Sheets สำเร็จ");
      else toast.warning("พบข้อผิดพลาด — ดูรายละเอียดด้านล่าง");
    } catch (e: any) {
      toast.error(e?.message ?? "ทดสอบไม่สำเร็จ");
      setResult({ ok: false, error: e?.message });
    } finally { setBusy(false); }
  }

  async function saveTabMap() {
    setSavingMap(true);
    try {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(tabMap)) {
        if (v && v.trim()) cleaned[k] = v.trim();
      }
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "set_tab_map", store_id: storeId, tab_map: cleaned },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success("บันทึกการแมปแท็บแล้ว");
      else throw new Error((data as any)?.error ?? "unknown");
    } catch (e: any) {
      toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally { setSavingMap(false); }
  }

  async function loadFolders() {
    setLoadingFolders(true);
    try {
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "list_drive_folders", store_id: storeId },
      });
      if (error) throw error;
      if ((data as any)?.ok) setDriveFolders((data as any).folders ?? []);
      else throw new Error((data as any)?.error ?? "unknown");
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดโฟลเดอร์ไม่สำเร็จ");
    } finally { setLoadingFolders(false); }
  }

  async function saveFolderMap() {
    setSavingFolderMap(true);
    try {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(folderMap)) {
        if (v && v.trim()) cleaned[k] = v.trim();
      }
      const { data, error } = await supabase.functions.invoke("rds-google-sync", {
        body: { mode: "set_drive_folder_map", store_id: storeId, folder_map: cleaned },
      });
      if (error) throw error;
      if ((data as any)?.ok) toast.success("บันทึกโฟลเดอร์ปลายทางแล้ว");
      else throw new Error((data as any)?.error ?? "unknown");
    } catch (e: any) {
      toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally { setSavingFolderMap(false); }
  }

  const sheet = result?.sheet;
  const drive = result?.drive;
  const tabs: string[] = sheet?.tabs ?? [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> ตรวจการเข้าถึง Google Sheets / Drive
          </p>
          <p className="text-xs text-muted-foreground">
            ทดสอบ Sheet ID + สิทธิ์การเข้าถึงและโฟลเดอร์ Drive ก่อนเริ่มซิงก์จริง
            พร้อมรีแมปชื่อแท็บชีตต่อประเภทเอกสารได้
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={runTest} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "กำลังทดสอบ..." : "ตรวจการเข้าถึง"}
        </Button>
      </div>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Sheet card */}
          <div className={`rounded-lg border p-3 text-xs space-y-1 ${sheet?.ok ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10" : "border-destructive/40 bg-destructive/5"}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Google Sheets</span>
              {sheet?.ok ? (
                <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> เข้าถึงได้</span>
              ) : (
                <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {sheet?.code ?? "error"}</span>
              )}
            </div>
            {sheet?.title && <p>ชื่อไฟล์: <b>{sheet.title}</b></p>}
            {sheet?.sheet_id && <p>ID: <span className="font-mono break-all">{sheet.sheet_id}</span></p>}
            {sheet?.owner_email && <p>เจ้าของไฟล์: <span className="font-mono">{sheet.owner_email}</span></p>}
            {typeof sheet?.can_edit === "boolean" && (
              <p>สิทธิ์แก้ไข (Editor): {sheet.can_edit
                ? <span className="text-emerald-600 font-medium">✓ มี</span>
                : <span className="text-destructive font-medium">✗ ไม่มี (Viewer เท่านั้น)</span>}
              </p>
            )}
            {sheet?.tabs && (
              <p>แท็บทั้งหมด ({sheet.tabs.length}): <span className="text-muted-foreground">{sheet.tabs.join(", ") || "—"}</span></p>
            )}
            {sheet?.url && (
              <a href={sheet.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                เปิด Sheet <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {sheet && !sheet.ok && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-background p-2 space-y-1">
                <p className="font-medium text-destructive">สาเหตุ + วิธีแก้:</p>
                {sheet.code === "sheet_not_found" && (
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>Sheet ID ที่ตั้งไว้ไม่ตรงกับไฟล์ที่มีจริงบน Google (อาจถูกลบ/เปลี่ยน URL)</li>
                    <li>คัดลอก ID จาก URL ระหว่าง <code>/d/</code> ถึง <code>/edit</code> แล้วบันทึกใหม่</li>
                    <li>เปิดไฟล์ใน Google กด Share → ให้บัญชี connector สิทธิ์ Editor</li>
                  </ol>
                )}
                {sheet.code === "sheet_no_access" && (
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>บัญชี Google ที่เชื่อม Lovable ไม่มีสิทธิ์เปิดไฟล์นี้</li>
                    <li>เปิด Sheet → Share → ให้สิทธิ์ Editor แล้วทดสอบใหม่</li>
                  </ol>
                )}
                {sheet.code === "sheet_read_only" && (
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>บัญชี Connector มีสิทธิ์แค่ <b>Viewer/Commenter</b> — เขียนข้อมูลไม่ได้</li>
                    <li>เปิด Sheet → ปุ่ม <b>Share</b> ที่มุมขวาบน</li>
                    <li>ค้นหาอีเมล Connector แล้วเปลี่ยน dropdown เป็น <b>Editor</b> → Save</li>
                    <li>ถ้าไฟล์อยู่ใน Shared Drive: เพิ่มบัญชีเป็นสมาชิกระดับ <b>Content manager</b> ขึ้นไป</li>
                  </ol>
                )}
                {sheet.code === "sheet_id_missing" && <p className="text-muted-foreground">ยังไม่ได้กรอก Google Sheet ID ในกล่องด้านบน</p>}
                {sheet.code === "connector_missing" && <p className="text-muted-foreground">Google Sheets connector ยังไม่ถูกเชื่อมต่อ</p>}
                {sheet.code === "connector_unauthorized" && <p className="text-muted-foreground">Session ของ connector หมดอายุ — เชื่อมต่อ Google Sheets ใหม่</p>}
                {sheet.error && <p className="text-muted-foreground break-all">รายละเอียด: {sheet.error}</p>}
                {sheet.permission_error && <p className="text-muted-foreground break-all">Drive permission probe: {sheet.permission_error}</p>}
              </div>
            )}
          </div>

          {/* Drive card */}
          <div className={`rounded-lg border p-3 text-xs space-y-1 ${drive?.ok ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10" : "border-destructive/40 bg-destructive/5"}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Google Drive</span>
              {drive?.ok ? (
                <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> เข้าถึงได้</span>
              ) : (
                <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {drive?.code ?? "error"}</span>
              )}
            </div>
            {drive?.name && <p>โฟลเดอร์: <b>{drive.name}</b></p>}
            {drive?.folder_id && <p>ID: <span className="font-mono break-all">{drive.folder_id}</span></p>}
            {drive?.owner_email && <p>เจ้าของโฟลเดอร์: <span className="font-mono">{drive.owner_email}</span></p>}
            {typeof drive?.can_add_children === "boolean" && (
              <p>สิทธิ์เพิ่มไฟล์ (Editor): {drive.can_add_children
                ? <span className="text-emerald-600 font-medium">✓ มี</span>
                : <span className="text-destructive font-medium">✗ ไม่มี</span>}
              </p>
            )}
            {drive?.url && (
              <a href={drive.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                เปิดโฟลเดอร์ <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {drive && !drive.ok && (
              <div className="mt-2 rounded-md border border-destructive/40 bg-background p-2 space-y-1">
                <p className="font-medium text-destructive">สาเหตุ + วิธีแก้:</p>
                {drive.code === "folder_not_found" && <p className="text-muted-foreground">ไม่พบโฟลเดอร์ปลายทาง — ตรวจ Folder ID หรือแชร์สิทธิ์ Editor</p>}
                {drive.code === "folder_no_access" && <p className="text-muted-foreground">ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ — แชร์สิทธิ์ Editor ให้ connector</p>}
                {drive.code === "folder_id_missing" && <p className="text-muted-foreground">ยังไม่ได้ตั้ง Folder ID</p>}
                {drive.code === "folder_read_only" && (
                  <ol className="list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>บัญชี Connector เห็นโฟลเดอร์แต่ <b>อัปโหลดไฟล์ไม่ได้</b> (Viewer/Commenter)</li>
                    <li>เปิดโฟลเดอร์ใน Drive → Share → เปลี่ยนเป็น <b>Editor</b></li>
                    <li>ถ้าเป็น Shared Drive: ต้องเป็น <b>Content manager</b> ขึ้นไป (Contributor ยังไม่พอสำหรับสร้างโฟลเดอร์ย่อย)</li>
                  </ol>
                )}
                {drive.code === "folder_trashed" && <p className="text-muted-foreground">โฟลเดอร์อยู่ในถังขยะ — กู้คืนหรือสร้างใหม่</p>}
                {drive.code === "not_a_folder" && <p className="text-muted-foreground">ID นี้เป็นไฟล์ ไม่ใช่โฟลเดอร์ — คัดลอก URL จากหน้า <code>/drive/folders/…</code></p>}
                {drive.error && <p className="text-muted-foreground break-all">รายละเอียด: {drive.error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {sheet?.ok && tabs.length > 0 && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-sm font-medium">รีแมปชื่อแท็บ Sheets ต่อประเภทเอกสาร</p>
          <p className="text-xs text-muted-foreground">
            เว้นว่างเพื่อใช้ชื่อมาตรฐาน · เลือกได้เฉพาะแท็บที่มีอยู่จริงในไฟล์
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {DOC_TYPES_FOR_MAP.map((dt) => (
              <div key={dt.key} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 text-muted-foreground">{dt.label}</span>
                <select
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1"
                  value={tabMap[dt.key] ?? ""}
                  onChange={(e) => setTabMap({ ...tabMap, [dt.key]: e.target.value })}
                >
                  <option value="">(ใช้ชื่อมาตรฐาน: {dt.label})</option>
                  {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveTabMap} disabled={savingMap}>
              <Save className="h-3.5 w-3.5 mr-1" /> {savingMap ? "บันทึก…" : "บันทึกการแมป"}
            </Button>
          </div>
        </div>
      )}

      {drive?.ok && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">ปลายทางบน Google Drive ต่อประเภทเอกสาร</p>
              <p className="text-xs text-muted-foreground">
                เลือกโฟลเดอร์ย่อยใต้โฟลเดอร์รูทของร้าน · เว้นว่าง = ให้ระบบสร้าง/เลือกให้เอง
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadFolders} disabled={loadingFolders}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingFolders ? "animate-spin" : ""}`} />
              {loadingFolders ? "กำลังโหลด…" : (driveFolders ? "โหลดใหม่" : "โหลดรายชื่อโฟลเดอร์")}
            </Button>
          </div>
          {driveFolders && driveFolders.length === 0 && (
            <p className="text-xs text-muted-foreground">ยังไม่มีโฟลเดอร์ย่อยในรูทของร้าน — กดซิงค์เอกสารครั้งแรกระบบจะสร้างให้อัตโนมัติ</p>
          )}
          {driveFolders && driveFolders.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {DOC_TYPES_FOR_MAP.map((dt) => (
                  <div key={dt.key} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">{dt.label}</span>
                    <select
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1"
                      value={folderMap[dt.key] ?? ""}
                      onChange={(e) => setFolderMap({ ...folderMap, [dt.key]: e.target.value })}
                    >
                      <option value="">(อัตโนมัติ: {dt.label})</option>
                      {driveFolders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    {folderMap[dt.key] && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setFolderMap({ ...folderMap, [dt.key]: "" })}
                        aria-label="ล้าง"
                      >
                        ล้าง
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveFolderMap} disabled={savingFolderMap}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {savingFolderMap ? "บันทึก…" : "บันทึกโฟลเดอร์"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}