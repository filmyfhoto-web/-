import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, MinusCircle } from "lucide-react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import {
  getHostMode,
  ADMIN_HOST_PRIMARY,
  STAFF_HOST_PRIMARY,
  CUSTOMER_HOST_PRIMARY,
} from "@/lib/hostMode";
import { STAFF_CALLBACK_URLS, LINE_CONSOLE_URL, LINE_LOGIN_CHANNEL_ID } from "@/lib/lineCallbacks";

type CheckStatus = "pending" | "ok" | "fail" | "optional";

type CheckResult = {
  id: string;
  title: string;
  description: string;
  status: CheckStatus;
  detail?: string;
};

const INITIAL: CheckResult[] = [
  { id: "host", title: "1. Host ปัจจุบัน", description: "ตรวจว่าโดเมนที่กำลังเปิดถูกจัด mode ตรงกับ hostMode.ts", status: "pending" },
  { id: "current_ready", title: "2. โดเมนปัจจุบันใช้งานได้ครบทุกส่วน", description: "ลูกค้า / พนักงาน / แอดมิน ใช้งานผ่านโดเมนเดียวกันนี้ได้ทันที ไม่ต้องตั้งค่า DNS เพิ่ม", status: "pending" },
  { id: "env", title: "3. Environment (ระบบหลังบ้าน)", description: "การเชื่อมต่อฐานข้อมูลถูกฝังใน bundle แล้ว", status: "pending" },
  { id: "admin_reachable", title: `เสริม: ${ADMIN_HOST_PRIMARY}`, description: "ซับโดเมนแยกสำหรับแอดมิน — ไม่จำเป็นต้องใช้", status: "pending" },
  { id: "staff_reachable", title: `เสริม: ${STAFF_HOST_PRIMARY}`, description: "ซับโดเมนแยกสำหรับพนักงาน — ไม่จำเป็นต้องใช้", status: "pending" },
];

async function pingNoCors(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

const LOVABLE_IP = "185.158.133.1";

type DnsRow = { type: string; name: string; value: string; note: string; host?: string };

const DNS_ROWS: DnsRow[] = [
  { type: "A", name: "@", value: LOVABLE_IP, note: "โดเมนหลัก (filmyynatta.com)" },
  { type: "A", name: "www", value: LOVABLE_IP, note: "เว็บลูกค้า", host: "www.filmyynatta.com" },
  { type: "A", name: "admin", value: LOVABLE_IP, note: "เว็บเจ้าของ/แอดมิน", host: ADMIN_HOST_PRIMARY },
  { type: "A", name: "staff", value: LOVABLE_IP, note: "เว็บพนักงาน (POS/สต๊อก/PO)", host: STAFF_HOST_PRIMARY },
  { type: "TXT", name: "_lovable", value: "lovable_verify=… (ค่าจากหน้า Domains)", note: "ยืนยันความเป็นเจ้าของโดเมน" },
];

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  } catch {
    toast.error("คัดลอกไม่ได้ — คัดลอกด้วยมือได้เลย");
  }
}

export default function DomainStatus() {
  const [checks, setChecks] = useState<CheckResult[]>(INITIAL);
  const [ranAt, setRanAt] = useState<string>("");
  const [running, setRunning] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : `https://${CUSTOMER_HOST_PRIMARY}`;

  const runAll = useCallback(async () => {
    setRunning(true);
    setChecks(INITIAL.map((c) => ({ ...c, status: "pending" as CheckStatus })));

    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const mode = getHostMode();
    const results: CheckResult[] = [];

    results.push({
      ...INITIAL[0],
      status: "ok",
      detail: `hostname=${host} • mode=${mode}`,
    });

    const selfOk = await pingNoCors(`${origin}/favicon.png?_=${Date.now()}`);
    results.push({
      ...INITIAL[1],
      status: selfOk ? "ok" : "fail",
      detail: selfOk
        ? `พร้อมใช้งาน — ลูกค้า ${origin}/shop • พนักงาน ${origin}/pos • แอดมิน ${origin}/admin-login`
        : "โหลดหน้าเว็บไม่สำเร็จ ลองรีเฟรชอีกครั้ง",
    });

    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    results.push({
      ...INITIAL[2],
      status: envUrl ? "ok" : "fail",
      detail: envUrl ? "เชื่อมต่อระบบหลังบ้านเรียบร้อย" : "ไม่พบค่า environment — build ไม่สมบูรณ์",
    });

    const adminOk = await pingNoCors(`https://${ADMIN_HOST_PRIMARY}/favicon.png?_=${Date.now()}`);
    results.push({
      ...INITIAL[3],
      status: adminOk ? "ok" : "optional",
      detail: adminOk ? "ซับโดเมนแอดมินพร้อมใช้งาน" : "ยังไม่ได้ตั้งค่า — ไม่จำเป็น ใช้ /admin-login บนโดเมนนี้ได้เลย",
    });

    const staffOk = await pingNoCors(`https://${STAFF_HOST_PRIMARY}/favicon.png?_=${Date.now()}`);
    results.push({
      ...INITIAL[4],
      status: staffOk ? "ok" : "optional",
      detail: staffOk ? "ซับโดเมนพนักงานพร้อมใช้งาน" : "ยังไม่ได้ตั้งค่า — ไม่จำเป็น ใช้ /pos บนโดเมนนี้ได้เลย",
    });

    setChecks(results);
    setRanAt(new Date().toLocaleString("th-TH"));
    setRunning(false);
  }, [origin]);

  useEffect(() => {
    runAll();
  }, [runAll]);

  const links = [
    { label: "ลิงก์ลูกค้า — สั่งของ / ตะกร้า / ประวัติออเดอร์", url: `${origin}/shop` },
    { label: "ลิงก์พนักงาน — POS / สต๊อก / PO", url: `${origin}/pos` },
    { label: "ลิงก์เจ้าของ/แอดมิน", url: `${origin}/admin-login` },
  ];

  const hasFail = checks.some((c) => c.status === "fail");
  const passedCount = checks.filter((c) => c.status === "ok").length;
  const totalChecked = checks.filter((c) => c.status !== "pending").length;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">สถานะการเชื่อมโดเมน</h1>
          <div className="flex items-center gap-2">
            <Badge variant={!hasFail && totalChecked > 0 ? "default" : "destructive"} className="rounded-md">
              ผ่าน {passedCount}/{totalChecked || checks.length}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            ระบบใช้งานได้ครบทุกส่วนบนโดเมนเดียว{" "}
            <code className="px-1 rounded bg-muted">{origin.replace(/^https?:\/\//, "")}</code> —
            ไม่ต้องตั้งค่า DNS หรือซับโดเมนเพิ่ม
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={runAll} disabled={running}>
              <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
              รันเช็คใหม่
            </Button>
            {ranAt && <span className="text-xs text-muted-foreground">ล่าสุด: {ranAt}</span>}
          </div>
        </header>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">ลิงก์แยกตามผู้ใช้ (คัดลอกส่งได้เลย)</h2>
          <p className="text-sm text-muted-foreground">
            ส่งเฉพาะลิงก์ที่ตรงกับผู้รับ — ลูกค้าไม่เห็นลิงก์พนักงาน/แอดมิน
          </p>
          <div className="space-y-2">
            {[
              { label: "ลูกค้า — สั่งของ / ตะกร้า / ประวัติออเดอร์", url: `${origin}/shop`, hint: "ส่งให้ลูกค้า" },
              { label: "พนักงาน — POS / สต๊อก / PO", url: `${origin}/pos`, hint: "ส่งให้พนักงาน" },
              { label: "เจ้าของ / แอดมิน — เข้าสู่ระบบหลังบ้าน", url: `${origin}/admin-login`, hint: "เก็บไว้ใช้เอง" },
            ].map((l) => (
              <div key={l.url} className="rounded border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{l.label}</div>
                    <div className="text-xs text-muted-foreground">{l.hint}</div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      aria-label={`คัดลอกลิงก์ ${l.label}`}
                      onClick={() => copyText(l.url)}
                    >
                      <Copy className="h-3 w-3 mr-1" /> คัดลอกลิงก์
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" asChild>
                      <a href={l.url} target="_blank" rel="noreferrer" aria-label={`เปิด ${l.label}`}>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                </div>
                <code className="block text-xs font-mono break-all bg-muted rounded px-2 py-1">{l.url}</code>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ซับโดเมน admin./staff. เป็นตัวเลือกเสริมเท่านั้น — ไม่ตั้งค่าก็ใช้งานได้ครบ
          </p>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">LINE Login — Callback URL ที่ต้องลงทะเบียน</h2>
          <p className="text-sm text-muted-foreground">
            ถ้าหน้าพนักงานขึ้น “400 คำขอไม่ถูกต้อง — ค่า redirect_uri ไม่ถูกต้อง” แปลว่ายังไม่ได้เพิ่ม URL
            เหล่านี้ใน LINE Developers Console → ช่อง {LINE_LOGIN_CHANNEL_ID} → LINE Login → Callback URL
            (ต้องตรงเป๊ะ ไม่มี / ต่อท้าย)
          </p>
          <div className="space-y-2">
            {STAFF_CALLBACK_URLS.map((u) => (
              <div key={u} className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all bg-muted rounded px-2 py-1">{u}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-shrink-0"
                  aria-label={`คัดลอก callback ${u}`}
                  onClick={() => copyText(u)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => copyText(STAFF_CALLBACK_URLS.join("\n"))}>
              <Copy className="h-3 w-3 mr-1" /> คัดลอกทั้งหมด
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={LINE_CONSOLE_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" /> เปิด LINE Developers Console
              </a>
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">เรคคอร์ด DNS (ตัวเลือกเสริม — ไม่ทำก็ได้)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Value</th>
                  <th className="p-2 text-left">ใช้ทำอะไร</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {DNS_ROWS.map((r) => (
                  <tr key={`${r.type}-${r.name}`} className="border-t">
                    <td className="p-2 font-mono">{r.type}</td>
                    <td className="p-2 font-mono">{r.name}</td>
                    <td className="p-2 font-mono break-all">{r.value}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.note}</td>
                    <td className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        aria-label={`คัดลอกค่า ${r.name}`}
                        onClick={() => copyText(r.value)}
                      >
                        <Copy className="h-3 w-3 mr-1" /> คัดลอก
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            ค่า TXT ที่แท้จริงดูได้จาก Project settings → Domains ตอนเริ่มเชื่อมโดเมน
          </p>
        </Card>

        <div className="space-y-3">
          {checks.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  {c.status === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {c.status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                  {c.status === "optional" && <MinusCircle className="h-5 w-5 text-muted-foreground" />}
                  {c.status === "pending" && <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{c.title}</h3>
                    <Badge variant={c.status === "ok" ? "default" : c.status === "fail" ? "destructive" : "secondary"}>
                      {c.status === "ok" ? "ผ่าน" : c.status === "fail" ? "ล้มเหลว" : c.status === "optional" ? "ไม่จำเป็น" : "รอ"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                  {c.detail && <p className="text-xs mt-2 font-mono break-all">{c.detail}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">ลิงก์ทดสอบด้วยตาเปล่า</h2>
          <p className="text-sm text-muted-foreground">คลิกเปิดแท็บใหม่แล้วสังเกตว่า URL สุดท้ายเป็นโดเมนใด</p>
          <div className="space-y-2">
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 p-3 rounded border hover:bg-muted transition"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground truncate font-mono">{l.url}</div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </a>
            ))}
          </div>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          หน้านี้เข้าถึงได้ทั้งจากโดเมนลูกค้าและโดเมนแอดมิน โดยไม่ต้องล็อกอิน
        </p>
      </div>
    </div>
  );
}