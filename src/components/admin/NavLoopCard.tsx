import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, Repeat, CheckCircle2 } from "lucide-react";
import { clearNavDiagnostics, readLoopIncidents, type LoopIncident } from "@/lib/navDiagnostics";

function fmtMs(ms: number) {
  if (!ms) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} วิ` : `${ms} ms`;
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString("th-TH"); } catch { return iso; }
}

/** Redirect / loop incidents recorded on this device. */
export default function NavLoopCard() {
  const [items, setItems] = useState<LoopIncident[]>([]);

  function load() {
    setItems([...readLoopIncidents()].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)));
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="bg-card rounded-2xl border border-border shadow-card p-5 space-y-3" data-testid="nav-loop-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-bold flex items-center gap-2"><Repeat className="w-4 h-4 text-primary" aria-hidden /> การเด้ง/วนหน้า (redirect loop)</h2>
          <p className="text-xs text-muted-foreground">
            บันทึกจากเครื่องนี้: หน้าเดิมถูกเปิดซ้ำ หรือสองหน้าเด้งสลับกันภายใน 10 วินาที
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={load} data-testid="nav-loop-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl text-destructive"
            data-testid="nav-loop-clear"
            onClick={() => { clearNavDiagnostics(); load(); }}
          >
            <Trash2 className="w-4 h-4 mr-1" /> ล้างบันทึก
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid="nav-loop-empty">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden /> ไม่พบการเด้ง/วนหน้าในเครื่องนี้
        </p>
      ) : (
        <ul className="space-y-2" data-testid="nav-loop-list">
          {items.map((it) => (
            <li key={it.id + it.lastAt} className="rounded-xl border border-border p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{it.kind === "pingpong" ? "เด้งสลับ 2 หน้า" : "เปิดหน้าเดิมซ้ำ"}</Badge>
                <span className="font-medium break-all">{it.signature}</span>
                <Badge className="bg-destructive text-destructive-foreground border-0">{it.count} ครั้ง</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                เวลาห่างเฉลี่ย {fmtMs(it.avgIntervalMs)} · เร็วสุด {fmtMs(it.minIntervalMs)}
              </div>
              <div className="text-xs text-muted-foreground">
                เริ่ม {fmtTime(it.firstAt)} · ล่าสุด {fmtTime(it.lastAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}