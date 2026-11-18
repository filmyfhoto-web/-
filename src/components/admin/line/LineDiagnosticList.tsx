import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, PlayCircle, ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  label: string;
  status: "idle" | "running" | "ok" | "fail";
  ms?: number;
  reason_th?: string;
  fix_th?: string;
  raw?: any;
};

const INITIAL: Row[] = [
  { id: "token", label: "Channel Access Token ใช้งานได้", status: "idle" },
  { id: "secret", label: "Channel Secret รูปแบบถูกต้อง", status: "idle" },
  { id: "webhook", label: "Webhook signature ผ่าน", status: "idle" },
  { id: "mode_b", label: "Messaging API (Mode B) พร้อม", status: "idle" },
  { id: "admin_send", label: "ส่งข้อความทดสอบถึงแอดมิน", status: "idle" },
];

export default function LineDiagnosticList({ enableAdminSend = false }: { enableAdminSend?: boolean }) {
  const [rows, setRows] = useState<Row[]>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function patch(id: string, next: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  async function runAll() {
    setBusy(true);
    setRows(INITIAL.map((r) => ({ ...r, status: "running" as const })));
    try {
      // 1) config-check → token + secret + messaging readiness
      const t0 = performance.now();
      const { data: cfg } = await supabase.functions.invoke("line-config-check", { body: {} });
      const cfgMs = Math.round(performance.now() - t0);
      const oaOk = !!(cfg as any)?.oa?.ok;
      patch("token", {
        status: oaOk ? "ok" : "fail",
        ms: cfgMs,
        reason_th: oaOk ? "LINE ตอบกลับสำเร็จ" : "Token ใช้งานไม่ได้ — คัดลอกใหม่จาก Messaging API",
        fix_th: oaOk ? undefined : "ไปที่ LINE Developers → Messaging API → Channel access token → กด Issue แล้ววาง token ใหม่",
        raw: (cfg as any)?.oa,
      });
      const secretShape = (cfg as any)?.env?.messaging_channel_secret;
      patch("secret", {
        status: secretShape === "hex32_ok" ? "ok" : "fail",
        reason_th:
          secretShape === "hex32_ok" ? "hex 32 ตัวอักษร ถูกต้อง" :
          secretShape === "set_but_unexpected_shape" ? "ตั้งค่าแล้วแต่รูปแบบไม่ตรง (ต้องเป็น hex 32 ตัว)" :
          "ยังไม่ตั้งค่า",
        fix_th: "คัดลอกจาก Basic settings → Channel secret (ไม่ใช่ token) แล้วอัปเดต secret LINE_CHANNEL_SECRET",
      });
      const modeBReady = !!(cfg as any)?.mode_b_ready;
      patch("mode_b", {
        status: modeBReady ? "ok" : "fail",
        reason_th: modeBReady ? "Messaging API พร้อมส่ง/รับข้อความ" : "ยังไม่ครบ — ต้องมี Token, Channel Secret และ Admin User ID ที่ถูกต้อง",
        fix_th: ((cfg as any)?.admin_remediation || []).join(" · ") || "ตรวจสอบแอดมินเพิ่ม OA เป็นเพื่อน และตั้งค่า LINE_ADMIN_USER_ID ให้ถูกต้อง",
      });

      // 2) webhook signature self-test
      const t1 = performance.now();
      const { data: wh, error: whErr } = await supabase.functions.invoke("line-selftest", { body: { kind: "webhook_signature" } });
      const whMs = Math.round(performance.now() - t1);
      const whOk = !whErr && (wh as any)?.ok === true;
      patch("webhook", {
        status: whOk ? "ok" : "fail",
        ms: whMs,
        reason_th: whOk ? "HMAC ตรงกับ LINE_CHANNEL_SECRET" : ((wh as any)?.reason_th || whErr?.message || "ยังไม่ผ่าน"),
        fix_th: "ตรวจว่าใช้ Channel secret ตัวเดียวกับใน Basic settings และวาง Webhook URL ถูกต้อง",
        raw: wh,
      });

      // 3) admin test send (optional — only if enabled)
      if (enableAdminSend) {
        const t2 = performance.now();
        const { data: ad, error: adErr } = await supabase.functions.invoke("line-notify", { body: { kind: "admin_test" } });
        const adMs = Math.round(performance.now() - t2);
        const admin = (ad as any)?.results?.admin;
        const adOk = !adErr && admin?.ok === true;
        patch("admin_send", {
          status: adOk ? "ok" : "fail",
          ms: adMs,
          reason_th: adOk ? "LINE ตอบ 200 OK" : admin?.skipped ? `ข้าม: ${admin?.reason}` : (adErr?.message || `LINE ${admin?.status || "?"}`),
          fix_th: "ให้แอดมินเพิ่ม OA เป็นเพื่อนก่อน แล้วตรวจว่า LINE_ADMIN_USER_ID เป็นรูปแบบ U + hex 32",
          raw: admin,
        });
      } else {
        patch("admin_send", { status: "idle", reason_th: "ข้าม — เปิดสวิตช์ 'ส่งจริงถึงแอดมิน' ก่อนถ้าต้องการ" });
      }
    } catch (e: any) {
      toast.error(e?.message || "รันทดสอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copySummary() {
    const lines = rows.map((r) => {
      const mark = r.status === "ok" ? "✅" : r.status === "fail" ? "❌" : "—";
      return `${mark} ${r.label}${r.ms ? ` (${r.ms}ms)` : ""}${r.reason_th ? ` — ${r.reason_th}` : ""}`;
    });
    try {
      await navigator.clipboard.writeText(`LINE Diagnostic — ${new Date().toLocaleString("th-TH")}\n\n${lines.join("\n")}`);
      toast.success("คัดลอกผลทดสอบแล้ว");
    } catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  const anyResult = rows.some((r) => r.status === "ok" || r.status === "fail");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={runAll} disabled={busy} className="rounded-xl bg-primary text-primary-foreground">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-1" />}
          รันทดสอบทั้งหมด
        </Button>
        {anyResult && (
          <Button variant="outline" onClick={copySummary} className="rounded-xl">
            <Copy className="w-4 h-4 mr-1" /> คัดลอกผล
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-xl border">
        {rows.map((r) => {
          const Icon = r.status === "ok" ? CheckCircle2 : r.status === "fail" ? XCircle : Loader2;
          const color = r.status === "ok" ? "text-success" : r.status === "fail" ? "text-destructive" : "text-muted-foreground";
          const spin = r.status === "running";
          return (
            <li key={r.id} className="p-3">
              <button
                type="button"
                onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                className="w-full flex items-center gap-2 text-left"
              >
                <Icon className={`w-4 h-4 shrink-0 ${color} ${spin ? "animate-spin" : ""}`} />
                <span className="flex-1 text-sm">{r.label}</span>
                {r.ms != null && <span className="text-[11px] text-muted-foreground">{r.ms}ms</span>}
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition ${expanded[r.id] ? "rotate-180" : ""}`} />
              </button>
              {expanded[r.id] && (
                <div className="mt-2 ml-6 text-xs space-y-1">
                  {r.reason_th && <div className={r.status === "fail" ? "text-destructive" : "text-muted-foreground"}>{r.reason_th}</div>}
                  {r.status === "fail" && r.fix_th && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">
                      <b>แก้ยังไง:</b> {r.fix_th}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
