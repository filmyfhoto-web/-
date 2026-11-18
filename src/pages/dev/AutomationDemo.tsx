import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SeoHead from "@/components/SeoHead";
import {
  DEMO_CARD_BUTTONS, DEMO_STATUS_FLOW, DEMO_STATUS_LABEL, applyDemoAction, autoPrice, demoTotal,
  finalPrice, formatBaht, lineArea, parseDemoCommand, sampleDemoJob,
  type DemoJob, type DemoLine, type DemoUnit,
} from "@/lib/automationDemo";

/**
 * หน้าทดลอง (DEMO เท่านั้น) — ไม่บันทึกฐานข้อมูล ไม่ส่ง LINE จริง
 * ทุก state อยู่ใน component นี้เท่านั้น
 */
export default function AutomationDemo() {
  const [job, setJob] = useState<DemoJob>(sampleDemoJob);
  const [log, setLog] = useState<{ from: "user" | "bot"; text: string }[]>([
    { from: "bot", text: "📋 พิมพ์ “ตอนนี้ทำอะไร”, “งานใหม่” หรือ “สั่งงาน” เพื่อลองใช้งาน" },
  ]);
  const [input, setInput] = useState("");
  const [doc, setDoc] = useState<null | "job_order" | "receipt">(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const total = useMemo(() => demoTotal(job.lines), [job.lines]);

  function run(action: Parameters<typeof applyDemoAction>[1], echo?: string) {
    const res = applyDemoAction(job, action);
    setJob(res.job);
    setLog((l) => [...l, ...(echo ? [{ from: "user" as const, text: echo }] : []), { from: "bot" as const, text: res.reply }]);
    if (res.openDoc) setDoc(res.openDoc);
    if (res.openIntake) setIntakeOpen(true);
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const action = parseDemoCommand(text);
    if (!action) {
      setLog((l) => [...l, { from: "user", text }, { from: "bot", text: "ยังไม่เข้าใจคำสั่งนี้ ลอง: ตอนนี้ทำอะไร / งานใหม่ / สั่งงาน" }]);
      return;
    }
    run(action, text);
  }

  function patchLine(id: string, patch: Partial<DemoLine>) {
    setJob((j) => ({ ...j, lines: j.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  return (
    <div className="min-h-screen bg-muted/30 p-3 sm:p-6">
      <SeoHead title="โหมดทดลองสั่งงานอัตโนมัติ" description="ลอง flow LINE ↔ เว็บ แบบไม่บันทึกและไม่ส่ง LINE จริง" path="/admin/automation-demo" />
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          โหมดทดลอง — ไม่บันทึก/ไม่ส่ง LINE จริง
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ---- ทางที่ 1: จำลองข้อความ LINE ---- */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">จำลองข้อความ LINE</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* การ์ดเดียว */}
              <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
                <div className="bg-teal-700 px-3 py-2 text-sm font-semibold text-white">งานปัจจุบัน / NATTA.Q</div>
                <div className="space-y-1 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{job.jobNo}</span>
                    <Badge variant="outline">{DEMO_STATUS_LABEL[job.status]}</Badge>
                  </div>
                  <div className="text-muted-foreground">ลูกค้า: {job.customer} · {job.phone}</div>
                  <div className="text-muted-foreground">รายการ: {job.lines.map((l) => l.name).join(", ")}</div>
                  <div className="text-muted-foreground">กำหนดรับ: {job.dueDate}</div>
                  <div className="text-muted-foreground">ผู้ทำ: {job.assignee ?? "-"}</div>
                  <div className="font-semibold">ยอดโดยประมาณ {formatBaht(total)} บาท</div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t p-2">
                  {DEMO_CARD_BUTTONS.map((b) => (
                    <Button key={b.action} size="sm" variant="outline" className="w-full text-xs" onClick={() => run(b.action)}>
                      {b.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-muted/40 p-2 text-sm">
                {log.map((m, i) => (
                  <div key={i} className={m.from === "user" ? "text-right" : ""}>
                    <span className={`inline-block rounded-lg px-2 py-1 ${m.from === "user" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="พิมพ์: ตอนนี้ทำอะไร / งานใหม่ / สั่งงาน" />
                <Button onClick={send}>ส่ง</Button>
              </div>
            </CardContent>
          </Card>

          {/* ---- ทางที่ 2: หน้าเว็บ ---- */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">หน้าเว็บ (ใบสั่งงาน)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {DEMO_STATUS_FLOW.map((s) => (
                  <Badge key={s} variant={s === job.status ? "default" : "outline"} className="text-xs">{DEMO_STATUS_LABEL[s]}</Badge>
                ))}
              </div>

              {job.lines.map((l) => {
                const area = lineArea(l);
                return (
                  <div key={l.id} className="space-y-2 rounded-lg border p-3">
                    <Input value={l.name} onChange={(e) => patchLine(l.id, { name: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <label className="text-xs">จำนวน
                        <Input type="number" inputMode="decimal" value={l.quantity} onChange={(e) => patchLine(l.id, { quantity: Number(e.target.value) })} />
                      </label>
                      <label className="text-xs">หน่วย
                        <select
                          className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                          value={l.unit}
                          onChange={(e) => patchLine(l.id, { unit: e.target.value as DemoUnit })}
                        >
                          <option value="m">เมตร (m)</option>
                          <option value="cm">เซนติเมตร (cm)</option>
                        </select>
                      </label>
                      <label className="text-xs">กว้าง
                        <Input type="number" inputMode="decimal" value={l.width} onChange={(e) => patchLine(l.id, { width: Number(e.target.value) })} />
                      </label>
                      <label className="text-xs">ยาว
                        <Input type="number" inputMode="decimal" value={l.height} onChange={(e) => patchLine(l.id, { height: Number(e.target.value) })} />
                      </label>
                      <label className="text-xs">อัตรา (บาท/ตร.ม.)
                        <Input type="number" inputMode="decimal" value={l.rate} onChange={(e) => patchLine(l.id, { rate: Number(e.target.value) })} />
                      </label>
                      <div className="text-xs">พื้นที่
                        <div className="flex h-10 items-center rounded-md border bg-muted/40 px-2 text-sm" data-testid="area">{area.toFixed(2)} ตร.ม.</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">ราคาอัตโนมัติ {formatBaht(autoPrice(l))} บาท</span>
                      <Button size="sm" variant={l.manual ? "secondary" : "outline"}
                        onClick={() => patchLine(l.id, l.manual ? { manual: false } : { manual: true, manualPrice: autoPrice(l) })}>
                        {l.manual ? "กลับเป็นราคาอัตโนมัติ" : "แก้ราคาเอง"}
                      </Button>
                    </div>
                    {l.manual && (
                      <Input type="number" inputMode="decimal" value={l.manualPrice} onChange={(e) => patchLine(l.id, { manualPrice: Number(e.target.value) })} />
                    )}
                    <div className="text-right font-semibold">ราคาสุดท้าย {formatBaht(finalPrice(l))} บาท</div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between border-t pt-2 font-semibold">
                <span>รวมทั้งสิ้น</span><span>{formatBaht(total)} บาท</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => run("doc_job_order")}>📄 ใบสั่งจ้าง</Button>
                <Button variant="outline" onClick={() => run("doc_receipt")}>🧾 ใบเสร็จรับเงิน</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{doc === "receipt" ? "ใบเสร็จรับเงิน (ตัวอย่าง)" : "ใบสั่งจ้าง (ตัวอย่าง)"}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">โหมดทดลอง — ไม่ออกเลขเอกสารจริง ของจริงจะใช้ document flow เดิมของ Film Shop</p>
            <div>เลขที่ (ตัวอย่าง): {doc === "receipt" ? "RC-DEMO-0001" : "JO-DEMO-0001"}</div>
            <div>ลูกค้า: {job.customer}</div>
            <table className="w-full text-xs">
              <thead><tr className="text-left"><th>รายการ</th><th>จำนวน</th><th>พื้นที่</th><th className="text-right">ราคา</th></tr></thead>
              <tbody>
                {job.lines.map((l) => (
                  <tr key={l.id}><td>{l.name}</td><td>{l.quantity}</td><td>{lineArea(l).toFixed(2)} ตร.ม.</td><td className="text-right">{formatBaht(finalPrice(l))}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between border-t pt-2 font-semibold"><span>รวม</span><span>{formatBaht(total)} บาท</span></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={intakeOpen} onOpenChange={setIntakeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>ฟอร์มสั่งงาน (ตัวอย่าง)</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div>งาน: {job.jobNo} · {job.customer}</div>
            <div>สถานะ: {DEMO_STATUS_LABEL[job.status]}</div>
            <p className="text-muted-foreground">ของจริงจะเปิดฟอร์มรับงานเดิม (/film-intake) พร้อม token — รอบนี้เป็นตัวอย่างเท่านั้น</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}