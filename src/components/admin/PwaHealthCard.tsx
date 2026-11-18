import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, Copy, Trash2, Loader2 } from "lucide-react";
import {
  checkPwaHealth,
  clearPwaLog,
  formatPwaLog,
  readPwaLog,
  type PwaHealth,
  type PwaLogEntry,
} from "@/lib/pwaDiagnostics";

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
      )}
      <span className="min-w-0">
        {label}
        {detail && <span className="block text-xs text-muted-foreground break-all">{detail}</span>}
      </span>
    </li>
  );
}

/** Install/offline diagnostics so support can see why a phone can't install. */
export default function PwaHealthCard() {
  const [health, setHealth] = useState<PwaHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<PwaLogEntry[]>([]);

  async function run() {
    setBusy(true);
    try {
      setHealth(await checkPwaHealth());
      setLog(readPwaLog());
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void run(); }, []);

  return (
    <section className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-4" data-testid="pwa-health-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold">สถานะการติดตั้งแอป (PWA)</h2>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          ตรวจอีกครั้ง
        </Button>
      </div>

      {health && (
        <>
          <ul className="space-y-1.5">
            <Row ok={health.manifestOk} label="ไฟล์ manifest" detail={health.manifestHref ?? health.manifestError} />
            <Row ok={health.iconsOk} label="ไอคอนแอป" detail={health.iconsError} />
            <Row ok={health.secureContext} label="เชื่อมต่อแบบปลอดภัย (HTTPS)" />
            <Row ok={!health.inIframe} label="ไม่ได้อยู่ใน iframe/พรีวิว" />
            <Row ok={!health.inAppBrowser} label="ไม่ได้เปิดจากเบราว์เซอร์ในแอป (LINE)" />
            <Row
              ok={health.serviceWorkerActive}
              label="โหมดออฟไลน์ (service worker)"
              detail={health.serviceWorkerActive ? undefined : "ทำงานเฉพาะเว็บที่เผยแพร่แล้ว"}
            />
            <Row
              ok={health.standalone || health.installPromptSeen}
              label={health.standalone ? "กำลังใช้งานแบบติดตั้งแล้ว" : "เบราว์เซอร์เสนอให้ติดตั้งได้"}
            />
          </ul>

          {health.blockers.length > 0 && (
            <div className="rounded-xl bg-destructive/10 text-destructive text-sm p-3">
              <b>ติดตั้งไม่ได้เพราะ:</b> {health.blockers.join(" · ")}
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">บันทึกเหตุการณ์ ({log.length})</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(formatPwaLog(log));
                toast.success("คัดลอก log แล้ว");
              }}
            >
              <Copy className="w-4 h-4 mr-1" /> คัดลอก
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { clearPwaLog(); setLog([]); }}>
              <Trash2 className="w-4 h-4 mr-1" /> ล้าง
            </Button>
          </div>
        </div>
        <pre className="max-h-56 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {log.length ? formatPwaLog(log) : "ยังไม่มีบันทึก"}
        </pre>
      </div>
    </section>
  );
}