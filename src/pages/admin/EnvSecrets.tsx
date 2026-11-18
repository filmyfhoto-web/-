import { useCallback, useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import SeoHead from "@/components/SeoHead";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Trash2, XCircle } from "lucide-react";

type Item = {
  name: string;
  label: string;
  required: boolean;
  present: boolean;
  status: "ok" | "missing" | "optional_missing" | "invalid";
  note: string;
};
type Unknown = { name: string; suspicious: boolean; reason: string };
type Audit = {
  ok: boolean;
  checked_at: string;
  items: Item[];
  unknowns: Unknown[];
  summary: { missing_required: number; invalid: number; suspicious: number; unknown: number };
};

const STATUS_META: Record<Item["status"], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "พร้อมใช้งาน", className: "bg-success/10 text-success border-success/30", Icon: CheckCircle2 },
  invalid: { label: "รูปแบบผิด", className: "bg-destructive/10 text-destructive border-destructive/30", Icon: XCircle },
  missing: { label: "ยังไม่ได้ตั้งค่า", className: "bg-destructive/10 text-destructive border-destructive/30", Icon: AlertTriangle },
  optional_missing: { label: "ไม่บังคับ", className: "bg-muted text-muted-foreground border-border", Icon: AlertTriangle },
};

/** ตรวจ secret/env ของระบบ — แสดงเฉพาะ “ชื่อ” และ “สถานะ” เท่านั้น ไม่แสดงค่าจริง */
export default function AdminEnvSecrets() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("env-secret-audit", { body: { action: "audit" } });
    if (error || !(data as Audit)?.ok) {
      setError(error?.message || "โหลดสถานะไม่สำเร็จ");
      setAudit(null);
    } else {
      setAudit(data as Audit);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestDelete() {
    if (!target) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("env-secret-audit", {
      body: { action: "request_delete", name: target, confirm: confirmText },
    });
    setDeleting(false);
    const res = data as { ok?: boolean; message?: string; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(res?.error === "required_secret" ? "secret นี้จำเป็นต่อระบบ — ลบไม่ได้" : res?.error || error?.message || "ทำรายการไม่สำเร็จ");
      return;
    }
    toast.success(res.message || "บันทึกคำขอลบแล้ว");
    setTarget(null);
    setConfirmText("");
    void load();
  }

  const s = audit?.summary;

  return (
    <AdminLayout>
      <SeoHead title="ตรวจสอบ Secret และ Environment" description="ตรวจว่ามี secret ใดขาด ผิดรูปแบบ หรือชื่อผิดปกติ โดยไม่แสดงค่าจริง" path="/admin/env-secrets" />
      <div className="max-w-4xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" /> ตรวจสอบ Secret และ Environment
            </h1>
            <p className="text-sm text-muted-foreground">
              แสดงเฉพาะ<b>ชื่อ</b>และ<b>สถานะ</b> — ค่าของ secret จะไม่ถูกส่งออกมาที่หน้าจอไม่ว่ากรณีใด
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="rounded-xl">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} ตรวจใหม่
          </Button>
        </header>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" data-testid="env-secrets-error">
            {error}
          </div>
        )}

        {s && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="env-secrets-summary">
            <SummaryTile label="จำเป็นแต่ยังขาด" value={s.missing_required} tone={s.missing_required ? "bad" : "good"} />
            <SummaryTile label="รูปแบบผิด" value={s.invalid} tone={s.invalid ? "bad" : "good"} />
            <SummaryTile label="ชื่อผิดปกติ" value={s.suspicious} tone={s.suspicious ? "warn" : "good"} />
            <SummaryTile label="ไม่รู้จัก" value={s.unknown} tone="neutral" />
          </div>
        )}

        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="font-semibold">ค่าที่ระบบใช้งาน</h2>
          {loading && !audit ? (
            <p className="text-sm text-muted-foreground">กำลังตรวจสอบ…</p>
          ) : (
            <ul className="space-y-2" data-testid="env-secrets-list">
              {(audit?.items ?? []).map((it) => {
                const meta = STATUS_META[it.status];
                return (
                  <li key={it.name} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                    <meta.Icon className="w-4 h-4 shrink-0" />
                    <code className="text-xs font-mono">{it.name}</code>
                    {it.required && <Badge variant="outline" className="text-[10px]">จำเป็น</Badge>}
                    <Badge variant="outline" className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
                    <span className="text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">{it.note}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="font-semibold">ชื่อที่ไม่รู้จัก / ผิดปกติ</h2>
          <p className="text-xs text-muted-foreground">
            ค่าเหล่านี้ไม่ได้ถูกใช้ในโค้ดชุดนี้ ตรวจสอบให้แน่ใจก่อนลบ — ต้องพิมพ์ชื่อยืนยันทุกครั้ง
          </p>
          {(audit?.unknowns ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่พบชื่อผิดปกติ</p>
          ) : (
            <ul className="space-y-2" data-testid="env-secrets-unknowns">
              {(audit?.unknowns ?? []).map((u) => (
                <li key={u.name} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2">
                  <code className="text-xs font-mono break-all">{u.name}</code>
                  {u.suspicious && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                      ผิดปกติ
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground w-full sm:w-auto">{u.reason}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg sm:ml-auto"
                    onClick={() => {
                      setTarget(u.name);
                      setConfirmText("");
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> ขอลบ
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการขอลบ secret</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  พิมพ์ชื่อ <code className="font-mono">{target}</code> เพื่อยืนยัน การลบจริงจะดำเนินการในหน้าตั้งค่าโปรเจกต์
                  ระบบจะบันทึกคำขอนี้ไว้ในบันทึกการตรวจสอบ และจะไม่มีการเปิดเผยค่าของ secret
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={target ?? ""}
                  className="font-mono"
                  data-testid="env-secret-confirm-input"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== target || deleting}
              onClick={(e) => {
                e.preventDefault();
                void requestDelete();
              }}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} ยืนยันคำขอลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" | "neutral" }) {
  const cls =
    tone === "bad"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
      : tone === "good"
      ? "border-success/30 bg-success/10 text-success"
      : "border-border bg-muted text-muted-foreground";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
