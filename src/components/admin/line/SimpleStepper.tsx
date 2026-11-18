import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";

/**
 * 3-step progress + guidance card for the LINE Messaging API setup.
 * Extracted from LineSettings.tsx so HMR reliably reloads a clean module.
 */
export default function SimpleStepper({
  tokenOk, webhookOk, adminOk, webhookUrl, onCopy, onRunCheck, onSendAdminTest, testing, testResp, adminShapeOk,
}: {
  tokenOk: boolean;
  webhookOk: boolean;
  adminOk: boolean;
  webhookUrl: string;
  onCopy: (text: string, label: string) => void;
  onRunCheck: () => void;
  onSendAdminTest: () => void;
  testing: boolean;
  testResp: any;
  adminShapeOk: boolean;
}) {
  const step1Done = tokenOk;
  const step2Done = webhookOk;
  const step3Done = testResp?.ok === true || adminOk;

  const StepBadge = ({ n, done, active }: { n: number; done: boolean; active: boolean }) => (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
      done ? "bg-success text-success-foreground" :
      active ? "bg-primary text-primary-foreground" :
      "bg-muted text-muted-foreground"
    }`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </div>
  );

  return (
    <section className="bg-card border border-border rounded-2xl p-5 shadow-card space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <StepBadge n={1} done={step1Done} active={!step1Done} />
        <div className={`text-sm ${step1Done ? "text-muted-foreground line-through" : "font-semibold"}`}>ใส่ Token</div>
        <div className="flex-1 h-px bg-border min-w-4" />
        <StepBadge n={2} done={step2Done} active={step1Done && !step2Done} />
        <div className={`text-sm ${step2Done ? "text-muted-foreground line-through" : step1Done ? "font-semibold" : "text-muted-foreground"}`}>เชื่อม Webhook</div>
        <div className="flex-1 h-px bg-border min-w-4" />
        <StepBadge n={3} done={step3Done} active={step1Done && step2Done && !step3Done} />
        <div className={`text-sm ${step3Done ? "text-muted-foreground line-through" : (step1Done && step2Done) ? "font-semibold" : "text-muted-foreground"}`}>ทดสอบ</div>
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${step1Done ? "bg-emerald-50/40 border-emerald-200" : ""}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StepBadge n={1} done={step1Done} active={!step1Done} />
          <span>ใส่ Channel Access Token (Messaging API)</span>
        </div>
        {step1Done ? (
          <p className="text-xs text-emerald-800 pl-10">✓ LINE ยืนยัน token ใช้งานได้</p>
        ) : (
          <div className="pl-10 space-y-2 text-xs">
            <p className="text-muted-foreground">
              คัดลอกจาก LINE Developers → Messaging API → <b>Channel access token (long-lived)</b> — แล้วอัปเดต secret ชื่อ <code>LINE_CHANNEL_ACCESS_TOKEN</code>
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="rounded-lg" asChild>
                <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1" /> เปิด LINE Developers
                </a>
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={onRunCheck}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> ตรวจอีกครั้ง
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${step2Done ? "bg-emerald-50/40 border-emerald-200" : step1Done ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StepBadge n={2} done={step2Done} active={step1Done && !step2Done} />
          <span>วาง Webhook URL ใน LINE Console</span>
        </div>
        <div className="pl-10 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <code className="flex-1 px-2 py-1.5 rounded bg-background border break-all">{webhookUrl}</code>
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => onCopy(webhookUrl, "Webhook URL")}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          {step2Done ? (
            <p className="text-emerald-800">✓ Channel Secret รูปแบบถูกต้อง — พร้อมรับ webhook</p>
          ) : (
            <p className="text-muted-foreground">
              วางใน Messaging API → <b>Webhook URL</b> → เปิด <b>Use webhook</b> → กด <b>Verify</b> ที่ LINE Console แล้วอัปเดต secret <code>LINE_CHANNEL_SECRET</code> ให้เป็น hex 32 ตัว
            </p>
          )}
        </div>
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${step3Done ? "bg-emerald-50/40 border-emerald-200" : (step1Done && step2Done) ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StepBadge n={3} done={step3Done} active={step1Done && step2Done && !step3Done} />
          <span>ส่งข้อความทดสอบไปหาแอดมิน</span>
        </div>
        <div className="pl-10 space-y-2 text-xs">
          {!adminShapeOk && (
            <p className="text-amber-700">ต้องตั้งค่า <code>LINE_ADMIN_USER_ID</code> (รูปแบบ U + hex 32) ก่อน — ดู "ตั้งค่าขั้นสูง" ด้านล่าง</p>
          )}
          <Button
            size="sm"
            onClick={onSendAdminTest}
            disabled={testing || !adminShapeOk || !step1Done}
            className="rounded-lg bg-gradient-primary text-primary-foreground"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            ส่งข้อความทดสอบไปหาฉัน
          </Button>
          {testResp && (
            <div className={testResp.ok ? "text-emerald-800" : "text-destructive"}>
              {testResp.ok ? "✅ ส่งสำเร็จ — เปิด LINE ดูข้อความได้เลย" :
                testResp.skipped ? `⚠️ ข้าม: ${testResp.reason}` :
                `❌ ส่งไม่สำเร็จ (${testResp.status || testResp.error || "?"})`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}