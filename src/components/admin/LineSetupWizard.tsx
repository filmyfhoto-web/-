import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, ChevronDown, ChevronUp, ExternalLink, MessageCircle, UserCircle2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Step-by-step setup helper for the LINE Messaging API integration.
 * Purely presentational — never receives or displays secret values.
 */
export default function LineSetupWizard({
  webhookUrl,
}: {
  webhookUrl: string;
}) {
  const [open, setOpen] = useState(true);

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`คัดลอก ${label}`); }
    catch { toast.error("คัดลอกไม่สำเร็จ"); }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5 shadow-card mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 text-left">
          <MessageCircle className="w-5 h-5 text-[#06C755]" />
          <h2 className="font-bold">ตัวช่วยตั้งค่า LINE Messaging API</h2>
          <Badge variant="outline" className="text-[10px]">อ่านครั้งแรก / เมื่อค่าเพี้ยน</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            ระบบใช้ <b>LINE Messaging API</b> แบบเดียว (Mode B) สำหรับส่งข้อความ/รับการยืนยันผ่านแชท LINE OA
            ไม่ต้องสร้าง LINE Login channel อีกต่อไป
          </p>

          <Step n={1} title="เปิด LINE Developers Console">
            เปิด <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">Console <ExternalLink className="w-3 h-3" /></a> แล้วเลือก Provider ของร้าน (สร้างใหม่ถ้ายังไม่มี)
          </Step>

          <Step n={2} icon={<MessageCircle className="w-4 h-4 text-[#06C755]" />} title="ตั้งค่า Messaging API channel">
            เข้า channel ประเภท <b>Messaging API</b> → แท็บ <b>Basic settings</b>:
            <FieldRow
              label="Channel secret"
              example="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
              hint="hex 32 ตัว (a–f, 0–9)"
              secret="LINE_CHANNEL_SECRET"
              wrongExamples={["Channel ID (ตัวเลข)", "Channel access token (ยาว >100 ตัว)", "Basic ID (@xxxx)"]}
            />
            <div className="mt-2">เข้าแท็บ <b>Messaging API</b> ต่อ:</div>
            <FieldRow
              label="Channel access token (long-lived)"
              example="Ab12+cd34/… (ยาว ~172 ตัว)"
              hint="กด Issue ถ้ายังไม่มี"
              secret="LINE_CHANNEL_ACCESS_TOKEN"
              wrongExamples={["Channel secret (hex 32)", "Channel ID"]}
            />
            <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs space-y-1">
              <div>วาง URL นี้ในช่อง <b>Webhook URL</b> แล้วเปิด <b>Use webhook = ON</b>:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1 rounded bg-background border break-all">{webhookUrl}</code>
                <Button size="sm" variant="outline" className="rounded-lg h-7" onClick={() => copy(webhookUrl, "Webhook URL")}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </Step>

          <Step n={3} icon={<UserCircle2 className="w-4 h-4 text-primary" />} title="เก็บ Admin userId">
            ให้แอดมินทัก OA อย่างน้อย 1 ครั้ง → เปิด <a href="/admin/line-webhook-events" className="text-primary underline">webhook events</a> คัดลอก userId (ขึ้นต้น "U" + hex 32) → เก็บใน <code>LINE_ADMIN_USER_ID</code>
          </Step>

          <Step n={4} icon={<CheckCircle2 className="w-4 h-4 text-success" />} title="ตรวจสอบ">
            กด <b>ตรวจตอนนี้</b> ด้านบน แล้วรันปุ่ม <b>ทดสอบ Webhook signature</b> ในการ์ด Self-tests
          </Step>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, icon, children }: { n: number; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2 font-semibold mb-1">
        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] flex items-center justify-center">{n}</span>
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-xs text-muted-foreground pl-7">{children}</div>
    </div>
  );
}

function FieldRow({
  label, example, hint, secret, wrongExamples,
}: {
  label: string; example: string; hint: string; secret: string; wrongExamples: string[];
}) {
  return (
    <div className="mt-2 rounded-lg border bg-background p-2 space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div><b>{label}</b> → เก็บใน <code className="text-[11px]">{secret}</code></div>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="text-[11px]"><span className="text-emerald-700">✅ ตัวอย่างที่ถูก:</span> <code className="break-all">{example}</code></div>
      <div className="text-[11px] text-rose-700">❌ อย่าคัดลอก: {wrongExamples.join(" · ")}</div>
    </div>
  );
}
