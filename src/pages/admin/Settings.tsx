import AdminLayout from "@/components/layout/AdminLayout";
import InstallPrompt from "@/components/InstallPrompt";
import PwaHealthCard from "@/components/admin/PwaHealthCard";
import PwaCacheResetCard from "@/components/PwaCacheResetCard";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, Copy, ExternalLink, MessageCircle, RefreshCw, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { validateLiffEndpoint } from "@/lib/lineUrlValidation";
import { RotateCcw } from "lucide-react";
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

const DEFAULT_LIFF_ID = "2010762305-5Yqzh5tB";

function LiffFields({
  liffId, endpointUrl, onChangeId, onChangeUrl, onCopy,
}: {
  liffId: string;
  endpointUrl: string;
  onChangeId: (v: string) => void;
  onChangeUrl: (v: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const suggested = `${origin}/l/shop`;
  const suggestedId = DEFAULT_LIFF_ID;
  const [confirmReset, setConfirmReset] = useState(false);
  const willChangeId = liffId !== suggestedId;
  const willChangeUrl = endpointUrl !== suggested;
  const idOk = !liffId || /^\d{10}-[A-Za-z0-9]+$/.test(liffId);
  const endpointCheck = validateLiffEndpoint(endpointUrl || "", {
    expectedOrigin: origin,
    liffId: liffId || null,
  });
  const levelClass =
    endpointCheck.level === "error"
      ? "text-destructive"
      : endpointCheck.level === "warn"
      ? "text-amber-600"
      : "text-emerald-600";
  return (
    <div className="md:col-span-2 rounded-xl border border-border bg-muted/40 p-4 space-y-3">
      <div className="text-sm font-semibold text-foreground/80">ตั้งค่า LIFF (ผูกบัญชี LINE)</div>

      <div>
        <Label>LIFF ID</Label>
        <div className="flex gap-2 mt-1">
          <Input
            className={`rounded-xl font-mono ${idOk ? "" : "border-destructive focus-visible:ring-destructive"}`}
            value={liffId}
            onChange={(e) => onChangeId(e.target.value)}
            placeholder="2010762305-5Yqzh5tB"
            aria-invalid={!idOk}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={() => onCopy(liffId, "LIFF ID")}
            disabled={!liffId}
            aria-label="คัดลอก LIFF ID"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        {!idOk && (
          <p className="text-[12px] text-destructive flex items-center gap-1 mt-1">
            <XCircle className="w-3.5 h-3.5" /> รูปแบบ LIFF ID ไม่ถูกต้อง (ตัวอย่าง 1234567890-xxxxxxxx)
          </p>
        )}
        {idOk && liffId && (
          <div className="mt-2">
            <Label className="text-[12px] text-muted-foreground">LIFF URL (สำหรับแชร์ / Rich Menu)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                readOnly
                className="rounded-xl font-mono bg-muted/50"
                value={`https://liff.line.me/${liffId}`}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                onClick={() => onCopy(`https://liff.line.me/${liffId}`, "LIFF URL")}
                aria-label="คัดลอก LIFF URL"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="rounded-xl shrink-0"
                asChild
                aria-label="เปิดทดสอบ LIFF URL"
              >
                <a href={`https://liff.line.me/${liffId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              ลิงก์นี้ใช้แชร์/ใส่ Rich Menu — LINE จะเปิด LIFF app แล้ว redirect ไปที่ Endpoint URL อัตโนมัติ
            </p>
          </div>
        )}
      </div>

      <div>
        <Label>LIFF Endpoint URL (ผูกบัญชี)</Label>
        <div className="flex gap-2 mt-1">
          <Input
            className="rounded-xl font-mono"
            value={endpointUrl}
            onChange={(e) => onChangeUrl(e.target.value)}
            placeholder={suggested}
            inputMode="url"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={() => onCopy(endpointUrl, "LIFF Endpoint URL")}
            disabled={!endpointUrl}
            aria-label="คัดลอก LIFF Endpoint URL"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={() => onChangeUrl(suggested)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
          >
            <RefreshCw className="w-3.5 h-3.5" /> ใช้ค่าที่แนะนำ ({suggested})
          </button>
          {endpointUrl && (
            <a
              href={endpointUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              <ExternalLink className="w-3.5 h-3.5" /> ทดสอบเปิดลิงก์
            </a>
          )}
        </div>
        {endpointCheck.issues.length > 0 ? (
          <ul className={`text-[12px] mt-2 space-y-0.5 ${levelClass}`}>
            {endpointCheck.issues.map((msg, i) => (
              <li key={i} className="flex items-start gap-1">
                {endpointCheck.level === "error" ? (
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                )}
                <span>{msg}</span>
              </li>
            ))}
          </ul>
        ) : endpointUrl ? (
          <p className="text-[12px] text-emerald-600 flex items-center gap-1 mt-2">
            <CheckCircle2 className="w-3.5 h-3.5" /> รูปแบบถูกต้อง
          </p>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        * ค่า LIFF ID และ Endpoint URL ต้องตรงกับที่ตั้งใน LINE Developer Console → LIFF ทุกตัวอักษร<br />
        * ห้ามใส่ Channel Secret ในหน้านี้ — เก็บใน Project Settings → Secrets เท่านั้น
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => setConfirmReset(true)}
          disabled={!willChangeId && !willChangeUrl}
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> รีเซ็ตเป็นค่าเริ่มต้น
        </Button>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันรีเซ็ตค่า LIFF?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>ค่าจะถูกเปลี่ยนกลับเป็นค่าที่แนะนำ — ยังไม่บันทึกจนกว่าจะกด "บันทึกการตั้งค่า"</div>
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 font-mono text-xs">
                  <div>
                    <div className="text-muted-foreground">LIFF ID</div>
                    <div className="line-through opacity-60 break-all">{liffId || "(ว่าง)"}</div>
                    <div className="text-emerald-600 break-all">→ {suggestedId}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">LIFF Endpoint URL</div>
                    <div className="line-through opacity-60 break-all">{endpointUrl || "(ว่าง)"}</div>
                    <div className="text-emerald-600 break-all">→ {suggested}</div>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onChangeId(suggestedId);
                onChangeUrl(suggested);
                setConfirmReset(false);
                toast.success("รีเซ็ตแล้ว กด 'บันทึกการตั้งค่า' เพื่อยืนยัน");
              }}
            >
              ยืนยันรีเซ็ต
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Validate a customer-facing LINE OA add-friend URL.
 * Accepts empty (feature disabled), rejects non-HTTPS / javascript: / data:
 * and unrelated hosts. Returns a normalized href or null.
 */
function validateLineAddFriendUrl(raw: string): { ok: boolean; href: string; host: string; error?: string } {
  const v = (raw || "").trim();
  if (!v) return { ok: true, href: "", host: "", error: undefined };
  let u: URL;
  try { u = new URL(v); } catch { return { ok: false, href: "", host: "", error: "รูปแบบ URL ไม่ถูกต้อง" }; }
  if (u.protocol !== "https:") return { ok: false, href: "", host: u.host, error: "ต้องเป็น https:// เท่านั้น" };
  const host = u.hostname.toLowerCase();
  const allowed = ["lin.ee", "line.me", "liff.line.me", "page.line.me"];
  if (!allowed.some((d) => host === d || host.endsWith("." + d))) {
    return { ok: false, href: "", host, error: "อนุญาตเฉพาะโดเมน line.me / lin.ee" };
  }
  return { ok: true, href: u.toString(), host };
}

function LineAddFriendField({
  value, onChange, originalValue,
}: { value: string; onChange: (v: string) => void; originalValue: string }) {
  const check = validateLineAddFriendUrl(value);
  const dirty = value !== originalValue;
  const disabled = !check.ok || !check.href;
  return (
    <div className="space-y-2">
      <Input
        className={`rounded-xl mt-1 ${check.ok ? "" : "border-destructive focus-visible:ring-destructive"}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://line.me/R/ti/p/@yourid หรือ https://lin.ee/xxxxx"
        inputMode="url"
        autoComplete="off"
        aria-invalid={!check.ok}
        aria-describedby="line-add-friend-help"
      />
      <p id="line-add-friend-help" className="text-[11px] text-muted-foreground">
        แสดงเป็นปุ่มสีเขียว "เพิ่มเพื่อน LINE" ที่หน้าต้อนรับก่อนเข้าดูสินค้า — ต้องเป็น https:// บนโดเมน line.me หรือ lin.ee เท่านั้น
      </p>
      {!check.ok && (
        <p className="text-[12px] text-destructive flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5" /> {check.error}
        </p>
      )}
      {check.ok && check.href && (
        <p className="text-[12px] text-success flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> ลิงก์ถูกต้อง ({check.host})
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {check.ok && check.href ? (
          <a
            href={check.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
          >
            <ExternalLink className="w-3.5 h-3.5" /> ทดสอบเปิดลิงก์
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border opacity-50 cursor-not-allowed"
          >
            <ExternalLink className="w-3.5 h-3.5" /> ทดสอบเปิดลิงก์
          </button>
        )}
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onChange(originalValue || "")}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="w-3.5 h-3.5" /> รีเซ็ตกลับค่าเดิม
        </button>
      </div>
      <div className="mt-2 rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground mb-2">ตัวอย่างปุ่มที่ลูกค้าจะเห็น</p>
        {disabled ? (
          <div className="w-full h-12 rounded-lg border border-dashed border-border grid place-items-center text-xs text-muted-foreground">
            {value ? "URL ไม่ถูกต้อง — ปุ่มจะไม่แสดงจนกว่าจะแก้ไข" : "ยังไม่ได้ตั้งค่า — จะแสดงข้อความติดต่อร้านแทน"}
          </div>
        ) : (
          <a
            href={check.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-lg bg-[#06C755] hover:bg-[#05b34c] text-white text-sm font-bold transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> เพิ่มเพื่อน LINE ของร้าน
          </a>
        )}
      </div>
    </div>
  );
}

const ROLES = [
  { v: "owner", l: "Super Admin (เจ้าของ)" },
  { v: "admin", l: "Admin" },
  { v: "stock_staff", l: "พนักงานสต็อก" },
  { v: "photo_staff", l: "พนักงานถ่ายรูป" },
];

type CheckResult = {
  env?: { admin_user_id_shape?: string };
  admin_profile?: { ok: boolean; displayName?: string };
  admin_remediation?: string[];
  oa?: { basicId?: string };
};

function Pill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? "text-success" : warn ? "text-amber-500" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
}

export default function AdminSettings() {
  const { isOwner } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [lineResult, setLineResult] = useState<CheckResult | null>(null);
  const [lineLoading, setLineLoading] = useState(false);

  // Core store settings (singleton row in `settings`)
  const [settingsRow, setSettingsRow] = useState<any | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [liffRow, setLiffRow] = useState<any | null>(null);
  const [liff, setLiff] = useState<{ liff_id: string; liff_endpoint_url: string }>({ liff_id: "", liff_endpoint_url: "" });
  const setLiffField = (k: "liff_id" | "liff_endpoint_url", v: string) => setLiff((p) => ({ ...p, [k]: v }));
  const [s, setS] = useState<Record<string, string>>({
    store_name: "", logo_url: "", address: "", phone: "", email: "", tax_id: "",
    receipt_header: "", receipt_footer: "", receipt_reply_template: "", receipt_line_template: "",
    line_url: "", line_add_friend_url: "", webhook_url: "", line_binding_policy: "optional",
    quote_prefix: "", order_prefix: "", delivery_prefix: "", po_prefix: "",
  });
  const setField = (k: string, v: string) => setS((prev) => ({ ...prev, [k]: v }));

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase.from("settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setSettingsRow(data);
        setS((prev) => {
          const next: Record<string, string> = { ...prev };
          Object.keys(prev).forEach((k) => {
            const v = (data as any)[k];
            next[k] = v == null ? "" : String(v);
          });
          if (!next.line_binding_policy) next.line_binding_policy = "optional";
          return next;
        });
      }
      const { data: oa } = await supabase
        .from("line_oa_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (oa) {
        setLiffRow(oa);
        setLiff({
          liff_id: ((oa as any).liff_id ?? "") as string,
          liff_endpoint_url: ((oa as any).liff_endpoint_url ?? "") as string,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "โหลดตั้งค่าไม่สำเร็จ");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    const check = validateLineAddFriendUrl(s.line_add_friend_url || "");
    if (!check.ok) {
      toast.error(`LINE เพิ่มเพื่อน URL: ${check.error}`);
      return;
    }
    setSettingsSaving(true);
    try {
      const payload: any = { ...s };
      Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (settingsRow?.id) payload.id = settingsRow.id;
      const { data, error } = await supabase
        .from("settings" as any)
        .upsert(payload)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (data) setSettingsRow(data);
      // Upsert LIFF fields into line_oa_settings
      const liffPayload: any = {
        liff_id: liff.liff_id?.trim() || null,
        liff_endpoint_url: liff.liff_endpoint_url?.trim() || null,
      };
      if (liffRow?.id) liffPayload.id = liffRow.id;
      const { data: oa, error: oaErr } = await supabase
        .from("line_oa_settings" as any)
        .upsert(liffPayload)
        .select("*")
        .maybeSingle();
      if (oaErr) throw oaErr;
      if (oa) {
        const prevId = ((liffRow as any)?.liff_id ?? "") as string;
        const prevUrl = ((liffRow as any)?.liff_endpoint_url ?? "") as string;
        const nextId = ((oa as any).liff_id ?? "") as string;
        const nextUrl = ((oa as any).liff_endpoint_url ?? "") as string;
        const changes: Record<string, { from: string | null; to: string | null }> = {};
        if (prevId !== nextId) changes.liff_id = { from: prevId || null, to: nextId || null };
        if (prevUrl !== nextUrl) changes.liff_endpoint_url = { from: prevUrl || null, to: nextUrl || null };
        if (Object.keys(changes).length > 0) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const uid = userData?.user?.id;
            if (uid) {
              await supabase.from("activity_logs" as any).insert({
                user_id: uid,
                action: "line.liff_settings_update",
                target_type: "line_oa_settings",
                target_id: (oa as any).id ?? null,
                detail: { changes, updated_at: new Date().toISOString() },
              });
            }
          } catch (logErr) {
            console.warn("activity_logs insert failed", logErr);
          }
        }
        setLiffRow(oa);
        setLiff({
          liff_id: ((oa as any).liff_id ?? "") as string,
          liff_endpoint_url: ((oa as any).liff_endpoint_url ?? "") as string,
        });
      }
      toast.success("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    } catch (e: any) {
      toast.error(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => { if (isOwner) loadSettings(); }, [isOwner]);

  async function invite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("กรุณากรอกอีเมลที่ถูกต้อง");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-invite-staff", {
      body: {
        email: trimmed,
        role,
        redirect_to: `${window.location.origin}/accept-admin-invite`,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "ส่งคำเชิญไม่สำเร็จ");
      return;
    }
    toast.success("ส่งคำเชิญเรียบร้อยแล้ว");
    setEmail("");
  }

  async function runLineCheck(silent = false) {
    setLineLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("line-config-check", { body: {} });
      if (error) { if (!silent) toast.error(error.message || "ตรวจสอบไม่สำเร็จ"); return; }
      setLineResult(data as CheckResult);
    } finally { setLineLoading(false); }
  }
  useEffect(() => { if (isOwner) runLineCheck(true); }, [isOwner]);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก ${label}`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  const env = lineResult?.env;
  const adminShapeOk = env?.admin_user_id_shape === "u_hex32_ok";
  const adminProfileOk = lineResult?.admin_profile?.ok === true;
  const addFriendUrl = lineResult?.oa?.basicId
    ? `https://line.me/R/ti/p/%40${lineResult.oa.basicId.replace(/^@/, "")}`
    : "";

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold mb-5">ตั้งค่าระบบ</h1>
      {!isOwner ? (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6 max-w-xl text-sm text-muted-foreground">
          เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มแอดมินได้
        </div>
      ) : (
        <Tabs defaultValue="general" className="max-w-3xl" data-testid="settings-tabs">
          <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
            <TabsTrigger value="general">ทั่วไป</TabsTrigger>
            <TabsTrigger value="line">LINE</TabsTrigger>
            <TabsTrigger value="security">ความปลอดภัย/บันทึก</TabsTrigger>
            <TabsTrigger value="domains">โดเมนและลิงก์</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-0">
        {/* Core store settings */}
        <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4">
          <h2 className="font-bold">ข้อมูลร้าน & เอกสาร</h2>
          {settingsLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…</div>
          ) : (
            <div className="grid gap-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>ชื่อร้าน</Label><Input className="rounded-xl mt-1" value={s.store_name} onChange={(e) => setField("store_name", e.target.value)} /></div>
                <div><Label>โลโก้ (URL)</Label><Input className="rounded-xl mt-1" value={s.logo_url} onChange={(e) => setField("logo_url", e.target.value)} /></div>
                <div className="md:col-span-2"><Label>ที่อยู่</Label><Textarea className="rounded-xl mt-1" rows={2} value={s.address} onChange={(e) => setField("address", e.target.value)} /></div>
                <div><Label>เบอร์โทร</Label><Input className="rounded-xl mt-1" value={s.phone} onChange={(e) => setField("phone", e.target.value)} /></div>
                <div><Label>อีเมล</Label><Input className="rounded-xl mt-1" value={s.email} onChange={(e) => setField("email", e.target.value)} /></div>
                <div><Label>เลขผู้เสียภาษี</Label><Input className="rounded-xl mt-1" value={s.tax_id} onChange={(e) => setField("tax_id", e.target.value)} /></div>
              </div>

              <div className="border-t border-border pt-4 grid gap-3">
                <h3 className="font-semibold text-sm">ใบเสร็จ & ข้อความ</h3>
                <div><Label>หัวใบเสร็จ</Label><Textarea className="rounded-xl mt-1" rows={2} value={s.receipt_header} onChange={(e) => setField("receipt_header", e.target.value)} /></div>
                <div><Label>ท้ายใบเสร็จ</Label><Textarea className="rounded-xl mt-1" rows={2} value={s.receipt_footer} onChange={(e) => setField("receipt_footer", e.target.value)} /></div>
                <div><Label>ข้อความตอบลูกค้า (Template)</Label><Textarea className="rounded-xl mt-1" rows={3} value={s.receipt_reply_template} onChange={(e) => setField("receipt_reply_template", e.target.value)} /></div>
                <div><Label>ข้อความส่งผ่าน LINE (Template)</Label><Textarea className="rounded-xl mt-1" rows={3} value={s.receipt_line_template} onChange={(e) => setField("receipt_line_template", e.target.value)} /></div>
              </div>

              <div className="border-t border-border pt-4 grid gap-3">
                <h3 className="font-semibold text-sm">Prefix เลขที่เอกสาร</h3>
                <div className="grid md:grid-cols-4 gap-3">
                  <div><Label>ใบเสนอราคา</Label><Input className="rounded-xl mt-1" value={s.quote_prefix} onChange={(e) => setField("quote_prefix", e.target.value)} placeholder="QT" /></div>
                  <div><Label>ใบสั่งขาย</Label><Input className="rounded-xl mt-1" value={s.order_prefix} onChange={(e) => setField("order_prefix", e.target.value)} placeholder="SO" /></div>
                  <div><Label>ใบส่งของ</Label><Input className="rounded-xl mt-1" value={s.delivery_prefix} onChange={(e) => setField("delivery_prefix", e.target.value)} placeholder="DN" /></div>
                  <div><Label>ใบสั่งซื้อ</Label><Input className="rounded-xl mt-1" value={s.po_prefix} onChange={(e) => setField("po_prefix", e.target.value)} placeholder="PO" /></div>
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={saveSettings} disabled={settingsSaving} className="rounded-xl bg-gradient-primary text-primary-foreground">
                  {settingsSaving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                </Button>
              </div>
            </div>
          )}
        </section>

        <h2 className="text-xl font-bold pt-2">Backfill Tax ID ลงใบเก่า</h2>
        <BackfillTaxCard />

        <h2 className="text-xl font-bold pt-2">เพิ่มแอดมิน</h2>
        <div className="bg-card rounded-2xl border border-border shadow-card p-6 grid gap-4">
          <div>
            <Label>อีเมลผู้ใช้</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="rounded-xl mt-1"
            />
          </div>
          <div>
            <Label>บทบาท</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              onClick={invite}
              disabled={busy}
              className="rounded-xl bg-gradient-primary text-primary-foreground"
            >
              {busy ? "กำลังส่ง..." : "ส่งคำเชิญ"}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            จัดการทีมงานทั้งหมด (แก้ไขบทบาท/ปลดสิทธิ์) →{" "}
            <Link to="/admin/staff" className="text-primary underline">บัญชีพนักงาน</Link>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="line" className="space-y-4 mt-0">
        <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4">
          <h2 className="font-bold">LINE OA & LIFF</h2>
          {settingsLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลด…</div>
          ) : (
            <div className="grid gap-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>LINE URL</Label><Input className="rounded-xl mt-1" value={s.line_url} onChange={(e) => setField("line_url", e.target.value)} placeholder="https://line.me/R/ti/p/@..." /></div>
                <div>
                  <Label>LINE เพิ่มเพื่อน URL (แสดงบนหน้า Welcome)</Label>
                  <LineAddFriendField
                    value={s.line_add_friend_url}
                    onChange={(v) => setField("line_add_friend_url", v)}
                    originalValue={settingsRow?.line_add_friend_url || ""}
                  />
                </div>
                <div><Label>Webhook URL</Label><Input className="rounded-xl mt-1" value={s.webhook_url} onChange={(e) => setField("webhook_url", e.target.value)} /></div>
                <div>
                  <Label>นโยบายผูก LINE</Label>
                  <Select value={s.line_binding_policy || "optional"} onValueChange={(v) => setField("line_binding_policy", v)}>
                    <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="optional">ไม่บังคับ</SelectItem>
                      <SelectItem value="recommended">แนะนำ</SelectItem>
                      <SelectItem value="required">บังคับก่อนเข้าชมสินค้า</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    เมื่อเลือก "บังคับก่อนเข้าชมสินค้า" ลูกค้าต้องเข้าสู่ระบบด้วย LINE และเพิ่มเพื่อนร้านก่อนดู/สั่งสินค้า
                  </p>
                </div>
                <LiffFields
                  liffId={liff.liff_id}
                  endpointUrl={liff.liff_endpoint_url}
                  onChangeId={(v) => setLiffField("liff_id", v)}
                  onChangeUrl={(v) => setLiffField("liff_endpoint_url", v)}
                  onCopy={copy}
                />
              </div>
              <div className="pt-1">
                <Button onClick={saveSettings} disabled={settingsSaving} className="rounded-xl bg-gradient-primary text-primary-foreground">
                  {settingsSaving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* LINE OA — ตั้ง LINE_ADMIN_USER_ID เพื่อรับแจ้งเตือน */}
        <section className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#06C755]" /> เพิ่ม LINE OA เป็นเพื่อน (รับแจ้งเตือนผ่าน LINE)
            </h2>
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => runLineCheck(false)} disabled={lineLoading}>
              {lineLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            เพิ่ม LINE OA เป็นเพื่อน แล้วนำ <code>userId</code> ของแอดมินไปตั้งเป็น secret <code>LINE_ADMIN_USER_ID</code> เพื่อให้ระบบส่งแจ้งเตือนถึงคุณได้
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl border p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">สถานะ LINE_ADMIN_USER_ID</div>
              <Pill
                ok={adminShapeOk}
                warn={env?.admin_user_id_shape === "set_but_unexpected_shape"}
                label={
                  adminShapeOk ? "รูปแบบถูกต้อง (U + hex 32)" :
                  env?.admin_user_id_shape === "set_but_unexpected_shape" ? "ตั้งค่าแล้วแต่รูปแบบไม่ถูก" :
                  "ยังไม่ตั้งค่า"
                }
              />
              {adminProfileOk && (
                <Pill ok label={`ทักหา OA แล้ว: ${lineResult?.admin_profile?.displayName || "ok"}`} />
              )}
              {lineResult?.admin_profile && !adminProfileOk && adminShapeOk && (
                <Pill ok={false} label="แอดมินยังไม่ได้เพิ่ม OA เป็นเพื่อน" />
              )}
            </div>

            <div className="rounded-xl border p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">ลิงก์เพิ่ม OA เป็นเพื่อน</div>
              {addFriendUrl ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2 py-1.5 rounded bg-background border text-xs break-all">{addFriendUrl}</code>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => copy(addFriendUrl, "ลิงก์เพิ่มเพื่อน")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" asChild>
                    <a href={addFriendUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">ยังหา Basic ID ของ OA ไม่พบ — ตรวจสอบว่าตั้งค่า Channel Access Token แล้ว</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                เปิดในมือถือ กด "เพิ่มเพื่อน" แล้วทัก OA 1 ครั้ง → นำ userId ไปตั้ง <code>LINE_ADMIN_USER_ID</code>
              </p>
            </div>
          </div>

          {(lineResult?.admin_remediation?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs space-y-1">
              <div className="font-semibold text-amber-800">ต้องแก้ไข:</div>
              <ul className="list-disc pl-5 text-amber-900">
                {lineResult!.admin_remediation!.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
              <Link to="/admin/line-webhook-events" className="underline text-primary mt-1 inline-block">
                เปิด webhook events เพื่อ copy userId →
              </Link>
            </div>
          )}

          <div className="pt-1">
            <Button variant="outline" size="sm" className="rounded-lg" asChild>
              <Link to="/admin/line-settings">ตั้งค่าโทเคน LINE + ผู้รับแจ้งเตือน</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg ml-2" asChild>
              <Link to="/admin/line-recipients">จัดการผู้รับแจ้งเตือน (หลายคน)</Link>
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg ml-2" asChild>
              <Link to="/admin/reply-templates">เทมเพลตตอบกลับ LINE OA</Link>
            </Button>
          </div>
        </section>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-0">
            <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-3">
              <h2 className="font-bold">ความปลอดภัย · บันทึกระบบ</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  { to: "/admin/security", label: "ความปลอดภัย / Log", desc: "สรุปสถานะความปลอดภัยและบันทึกการใช้งาน" },
                  { to: "/admin/security-audit", label: "Audit Log ความปลอดภัย", desc: "ประวัติการเปลี่ยนแปลงสิทธิ์และข้อมูลสำคัญ" },
                  { to: "/admin/product-views", label: "ประวัติการเข้าชมสินค้า", desc: "ดูว่าลูกค้าเปิดดูสินค้าใดบ้าง" },
                  { to: "/admin/staff", label: "บัญชีพนักงาน", desc: "จัดการบทบาทและสิทธิ์ของทีมงาน" },
                ].map((it) => (
                  <Link key={it.to} to={it.to} className="rounded-xl border border-border p-3 hover:bg-muted transition block">
                    <div className="text-sm font-semibold">{it.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{it.desc}</div>
                  </Link>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="domains" className="space-y-4 mt-0">
            <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-2">
              <h2 className="font-bold">โดเมนและ DNS</h2>
              <p className="text-sm text-muted-foreground">
                ตรวจสถานะโดเมนลูกค้า / พนักงาน / แอดมิน พร้อมเรคคอร์ด DNS ที่ต้องเพิ่มและขั้นตอนต่อไป และคัดลอกลิงก์ไปส่งให้ลูกค้า/พนักงานได้
              </p>
              <a href="/domain-status" className="inline-flex items-center text-sm underline font-medium">
                เปิดหน้าตรวจสอบสถานะโดเมนและลิงก์
              </a>
            </section>

            <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-3">
              <h2 className="font-bold">ติดตั้งเป็นเว็บแอป (PWA)</h2>
              <p className="text-sm text-muted-foreground">
                ลูกค้า / พนักงาน / แอดมิน ติดตั้งแยกกันเป็นคนละแอปได้ ต้องเปิดลิงก์ของแต่ละส่วนด้วย Safari (iPhone)
                หรือ Chrome (Android) แล้วกด “เพิ่มที่หน้าจอโฮม” (ถ้าเปิดจากในแอป LINE ให้กด ⋯ แล้วเลือกเปิดในเบราว์เซอร์ก่อน)
              </p>
              <InstallPrompt />
            </section>

            <PwaHealthCard />

            <PwaCacheResetCard />
          </TabsContent>
        </Tabs>
      )}
    </AdminLayout>
  );
}

function BackfillTaxCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ g: number; o: number; f: number } | null>(null);
  async function run() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_backfill_customer_tax_ids" as any);
      if (error) throw error;
      const row: any = Array.isArray(data) ? data[0] : data;
      const g = Number(row?.guest_orders_filled || 0);
      const o = Number(row?.orders_filled || 0);
      const f = Number(row?.film_invoices_filled || 0);
      setResult({ g, o, f });
      toast.success(`อัพเดต ${g + o + f} ใบ`);
    } catch (e: any) {
      toast.error(e?.message || "รันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-3">
      <p className="text-sm text-muted-foreground">
        คัดลอกเลขผู้เสียภาษี/สาขาจากข้อมูลลูกค้าไปยังใบเสร็จ/ใบกำกับภาษีเก่าที่ยังว่างอยู่ทั้งสองแอพ
        (จะไม่เขียนทับใบที่มีข้อมูลอยู่แล้ว)
      </p>
      <Button onClick={run} disabled={busy} className="rounded-xl">
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
        รัน Backfill อีกครั้ง
      </Button>
      {result && (
        <div className="text-xs text-muted-foreground grid gap-0.5">
          <div>• Guest orders (shop): <b className="text-foreground">{result.g}</b></div>
          <div>• Member orders (shop): <b className="text-foreground">{result.o}</b></div>
          <div>• Film invoices: <b className="text-foreground">{result.f}</b></div>
        </div>
      )}
    </div>
  );
}