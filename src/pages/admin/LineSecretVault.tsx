import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, KeyRound, Loader2, ShieldAlert, History, Send, Eraser, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type SecretName =
  | "LINE_CHANNEL_ACCESS_TOKEN"
  | "LINE_LOGIN_CHANNEL_TOKEN"
  | "LINE_LOGIN_CHANNEL_SECRET"
  | "LINE_CHANNEL_SECRET"
  | "LINE_LOGIN_CHANNEL_ID"
  | "LINE_ADMIN_USER_ID"
  | "LIFF_ID";

const FIELDS: { key: SecretName; label: string; hint: string; validate: (v: string) => { ok: boolean; reason: string } }[] = [
  {
    key: "LINE_LOGIN_CHANNEL_ID",
    label: "LINE_LOGIN_CHANNEL_ID",
    hint: "ตัวเลข 8–15 หลัก (LINE Login → Basic settings → Channel ID) — ห้ามใส่ Channel Secret",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: "⚠️ ค่านี้เป็น hex 32 ตัว — น่าจะเป็น Channel Secret ไม่ใช่ Channel ID" };
      if (!/^\d{8,15}$/.test(t)) return { ok: false, reason: `ต้องเป็นตัวเลข 8–15 หลัก (ได้ ${t.length})` };
      return { ok: true, reason: "รูปแบบผ่าน (Channel ID)" };
    },
  },
  {
    key: "LINE_CHANNEL_ACCESS_TOKEN",
    label: "LINE_CHANNEL_ACCESS_TOKEN",
    hint: "Access token ยาว ~172 ตัว (Messaging API → Channel access token long-lived)",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (/^Bearer\s/i.test(t)) return { ok: false, reason: "อย่ารวม 'Bearer '" };
      if (t.length < 80) return { ok: false, reason: `ยาว ${t.length} — น้อยไป` };
      return { ok: true, reason: `รูปแบบผ่าน (${t.length} ตัว)` };
    },
  },
  {
    key: "LINE_LOGIN_CHANNEL_TOKEN",
    label: "LINE_LOGIN_CHANNEL_TOKEN",
    hint: "ตัวเลือกเสริมสำหรับ debug LIFF API เท่านั้น — ถ้าหน้า LINE ไม่มีช่องนี้ ให้ข้ามได้ ไม่กระทบการล็อกอิน/ผูกบัญชี",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (/^Bearer\s/i.test(t)) return { ok: false, reason: "อย่ารวม 'Bearer '" };
      if (/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: "⚠️ ค่านี้ hex 32 — น่าจะเป็น Channel Secret ไม่ใช่ Access Token" };
      if (t.length < 80) return { ok: false, reason: `ยาว ${t.length} — access token มักยาว ~172` };
      return { ok: true, reason: `รูปแบบผ่าน (${t.length} ตัว)` };
    },
  },
  {
    key: "LINE_CHANNEL_SECRET",
    label: "LINE_CHANNEL_SECRET",
    hint: "hex 32 ตัว (Messaging API channel → Basic settings → Channel secret)",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (!/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: `ต้อง hex 32 ตัว (ได้ ${t.length})` };
      return { ok: true, reason: "รูปแบบผ่าน (hex 32)" };
    },
  },
  {
    key: "LINE_LOGIN_CHANNEL_SECRET",
    label: "LINE_LOGIN_CHANNEL_SECRET",
    hint: "hex 32 ตัว (LINE Login channel → Basic settings → Channel secret)",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (!/^[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: `ต้อง hex 32 ตัว (ได้ ${t.length})` };
      return { ok: true, reason: "รูปแบบผ่าน (hex 32)" };
    },
  },
  {
    key: "LINE_ADMIN_USER_ID",
    label: "LINE_ADMIN_USER_ID",
    hint: "userId ของแอดมิน (ขึ้นต้น U + hex 32 ตัว) — ดูจาก webhook events หลัง add friend",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (!/^U[0-9a-f]{32}$/i.test(t)) return { ok: false, reason: "ต้องขึ้นต้น U + hex 32 ตัว" };
      return { ok: true, reason: "รูปแบบผ่าน (LINE userId)" };
    },
  },
  {
    key: "LIFF_ID",
    label: "LIFF_ID",
    hint: "รูปแบบ 1234567890-abcdefg (LINE Login → LIFF → LIFF ID)",
    validate: (v) => {
      const t = v.trim(); if (!t) return { ok: false, reason: "ยังว่าง" };
      if (!/^\d+-[a-zA-Z0-9]+$/.test(t)) return { ok: false, reason: "รูปแบบควรเป็น 1234567890-abcdefg" };
      return { ok: true, reason: "รูปแบบผ่าน (LIFF ID)" };
    },
  },
];

type HistoryRow = { id: string; created_at: string; detail: any };

export default function AdminLineSecretVault() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const timerRef = useRef<Record<string, number>>({});

  function setValue(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
    if (timerRef.current[key]) window.clearTimeout(timerRef.current[key]);
    if (v) timerRef.current[key] = window.setTimeout(() => setValues((s) => ({ ...s, [key]: "" })), 60_000);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("activity_logs")
      .select("id, created_at, detail")
      .in("action", ["line.secret_update_request", "line.connection_test", "line.admin_push_test"])
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data as any) || []);
    setLoadingHistory(false);
  }
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => () => Object.values(timerRef.current).forEach((t) => window.clearTimeout(t)), []);

  const results = useMemo(() => FIELDS.map((f) => ({ f, v: values[f.key] || "", r: f.validate(values[f.key] || "") })), [values]);

  async function submit(name: SecretName) {
    const v = values[name] || "";
    const check = FIELDS.find((f) => f.key === name)!.validate(v);
    if (!check.ok) { toast.error(check.reason); return; }
    setSubmitting(name);
    try {
      const { data, error } = await supabase.functions.invoke("line-secret-update", { body: { name, value: v } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || data?.error || "ส่งไม่สำเร็จ");
      toast.success("บันทึกคำขออัปเดตแล้ว — แจ้งผู้พัฒนาเพื่อรัน update_secret");
      setValues((s) => ({ ...s, [name]: "" }));
      loadHistory();
    } catch (e: any) {
      toast.error(e?.message || "ส่งคำขอไม่สำเร็จ");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <AdminLayout>
      <SeoHead title="อัปเดต LINE Secret" description="ฟอร์มปิดบังสำหรับส่งคำขอเปลี่ยน LINE token/secret พร้อมประวัติ" path="/admin/line-secret-vault" />
      <div className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2"><KeyRound className="w-6 h-6 text-primary" /> ห้องนิรภัย LINE Secret</h1>
        <p className="text-sm text-muted-foreground mt-1">ฟอร์มปิดบังค่า พร้อมตรวจรูปแบบก่อนส่ง — ทุกครั้งจะบันทึกลง activity log</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 flex gap-3 text-sm">
        <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0" />
        <div>
          <b className="text-amber-900">ข้อจำกัดด้านความปลอดภัย:</b> Lovable Cloud secret ไม่สามารถอัปเดตผ่านหน้าเว็บได้โดยตรง
          — เมื่อกด "ส่งคำขออัปเดต" ระบบจะบันทึก fingerprint (last-4 + length + sha256 prefix)
          และคุณจะได้แจ้งผู้พัฒนาเพื่อรัน <code>update_secret</code> tool ของ Lovable ให้ค่าจริงถูกนำไปใช้
          <div className="mt-1 text-xs text-amber-800">ค่าที่คุณพิมพ์จะถูกล้างจากช่องอัตโนมัติภายใน 60 วินาที</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {results.map(({ f, v, r }) => (
          <div key={f.key} className="bg-card border border-border rounded-2xl p-4 shadow-card">
            <Label className="font-mono text-xs">{f.label}</Label>
            <p className="text-[11px] text-muted-foreground mb-2">{f.hint}</p>
            <div className="relative">
              <Input
                type={shown[f.key] ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={v}
                onChange={(e) => setValue(f.key, e.target.value)}
                placeholder="วางค่าใหม่ที่นี่"
                className="rounded-lg font-mono text-xs pr-9"
              />
              <button
                type="button"
                onClick={() => setShown((s) => ({ ...s, [f.key]: !s[f.key] }))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="toggle visibility"
              >
                {shown[f.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {v && (
              <div className={`inline-flex items-center gap-1 mt-2 text-[11px] ${r.ok ? "text-success" : "text-destructive"}`}>
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {r.reason}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => submit(f.key)} disabled={!r.ok || submitting === f.key} className="rounded-lg">
                {submitting === f.key ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                ส่งคำขออัปเดต
              </Button>
              <Button size="sm" variant="outline" onClick={() => setValue(f.key, "")} disabled={!v} className="rounded-lg">
                <Eraser className="w-4 h-4 mr-1" /> ล้าง
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2"><History className="w-5 h-5" /> ประวัติการตรวจสอบ / อัปเดต LINE (30 รายการล่าสุด)</h2>
          <Button size="sm" variant="outline" onClick={loadHistory} disabled={loadingHistory} className="rounded-lg">
            {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : "รีเฟรช"}
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีประวัติ</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => {
              const action: string = (h as any).action || h.detail?.action;
              return (
                <div key={h.id} className="border border-border rounded-lg p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{new Date(h.created_at).toLocaleString("th-TH")}</Badge>
                    {h.detail?.name && <Badge className="text-[10px]">{h.detail.name}</Badge>}
                    {h.detail?.last4 && <span className="font-mono">…{h.detail.last4} · len={h.detail.length} · sha{h.detail.sha256_prefix8}</span>}
                    {h.detail?.only && <span>only={h.detail.only}</span>}
                    {typeof h.detail?.all_ok === "boolean" && (
                      <Badge variant={h.detail.all_ok ? "default" : "destructive"} className="text-[10px]">{h.detail.all_ok ? "PASS" : "FAIL"}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}