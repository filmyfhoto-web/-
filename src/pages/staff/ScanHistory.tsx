import { useEffect, useMemo, useState } from "react";
import StaffLayout from "@/components/layout/StaffLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ScanLine, CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
  Camera, Crop, ListPlus, Package, SkipForward,
} from "lucide-react";

type Row = {
  id: string;
  action: string;
  created_at: string;
  detail: any;
};

const ACTION_META: Record<string, { label: string; icon: any; tone: string }> = {
  scan_session_start:    { label: "เริ่มเซสชัน",          icon: ScanLine,    tone: "bg-primary/10 text-primary" },
  scan_session_finish:   { label: "ปิดเซสชัน",            icon: CheckCircle2,tone: "bg-muted text-muted-foreground" },
  scan_ocr_success:      { label: "OCR สำเร็จ",          icon: CheckCircle2,tone: "bg-emerald-100 text-emerald-700" },
  scan_ocr_error:        { label: "OCR ไม่สำเร็จ",        icon: AlertTriangle,tone: "bg-amber-100 text-amber-700" },
  scan_barcode_duplicate:{ label: "บาร์โค้ดซ้ำ",          icon: AlertTriangle,tone: "bg-destructive/10 text-destructive" },
  scan_barcode_skipped:  { label: "ข้ามรายการซ้ำ",         icon: SkipForward, tone: "bg-amber-50 text-amber-700" },
  scan_image_cropped:    { label: "ครอป/ซูมภาพ",          icon: Crop,        tone: "bg-muted text-foreground" },
  scan_bulk_save:        { label: "บันทึกคิวทั้งหมด",     icon: ListPlus,    tone: "bg-primary/10 text-primary" },
  scan_product_saved:    { label: "บันทึกสินค้าใหม่",     icon: Package,     tone: "bg-emerald-100 text-emerald-700" },
};

function fmtTime(s: string) {
  try { return new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return s; }
}

export default function ScanHistory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("activity_logs")
      .select("id,action,created_at,detail")
      .eq("user_id", user.id)
      .eq("target_type", "product_scan")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data || []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [user?.id]);

  const sessions = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const sid = (r.detail?.session_id as string) || `single-${r.id}`;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(r);
    }
    return Array.from(map.entries()).map(([sid, items]) => {
      const sorted = [...items].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      const counts: Record<string, number> = {};
      for (const r of sorted) counts[r.action] = (counts[r.action] || 0) + 1;
      const saved = counts["scan_product_saved"] || 0;
      const dup = counts["scan_barcode_duplicate"] || 0;
      const ocrOk = counts["scan_ocr_success"] || 0;
      const ocrErr = counts["scan_ocr_error"] || 0;
      const startAt = sorted[0]?.created_at;
      const endAt = sorted[sorted.length - 1]?.created_at;
      const status: "ok" | "warn" | "empty" =
        saved > 0 ? "ok" : (dup > 0 || ocrErr > 0) ? "warn" : "empty";
      return { sid, items: sorted, counts, saved, dup, ocrOk, ocrErr, startAt, endAt, status };
    }).sort((a, b) => +new Date(b.startAt || 0) - +new Date(a.startAt || 0));
  }, [rows]);

  function toggle(sid: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  }

  return (
    <StaffLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScanLine className="w-6 h-6" /> ประวัติการสแกนของฉัน
          </h1>
          <Button size="sm" variant="outline" onClick={load} className="rounded-xl">
            <RefreshCw className="w-4 h-4 mr-1" /> รีเฟรช
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          แสดงสรุปเซสชันการสแกนสินค้าของคุณจาก activity_logs (สูงสุด 500 รายการล่าสุด)
        </p>

        {loading ? (
          <Card className="p-6 text-center text-muted-foreground rounded-2xl">กำลังโหลด…</Card>
        ) : sessions.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground rounded-2xl">
            ยังไม่มีประวัติการสแกน — ลองเปิดกล้องที่หน้า "เพิ่มสินค้า"
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const tone =
                s.status === "ok" ? "border-emerald-300 bg-emerald-50/50" :
                s.status === "warn" ? "border-amber-300 bg-amber-50/50" :
                "border-border";
              const isOpen = expanded.has(s.sid);
              return (
                <Card key={s.sid} className={`p-3 rounded-2xl ${tone}`}>
                  <button onClick={() => toggle(s.sid)} className="w-full flex items-start gap-2 text-left">
                    {isOpen ? <ChevronDown className="w-4 h-4 mt-1" /> : <ChevronRight className="w-4 h-4 mt-1" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {fmtTime(s.startAt)} {s.endAt && s.endAt !== s.startAt && <span className="text-muted-foreground">→ {new Date(s.endAt).toLocaleTimeString("th-TH")}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1 text-[11px]">
                        <Badge variant="secondary">{s.items.length} เหตุการณ์</Badge>
                        {s.saved > 0 && <Badge className="bg-emerald-600">บันทึก {s.saved}</Badge>}
                        {s.ocrOk > 0 && <Badge className="bg-blue-600">OCR สำเร็จ {s.ocrOk}</Badge>}
                        {s.ocrErr > 0 && <Badge className="bg-amber-600">OCR พลาด {s.ocrErr}</Badge>}
                        {s.dup > 0 && <Badge variant="destructive">ซ้ำ {s.dup}</Badge>}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="mt-3 space-y-1 border-t pt-2">
                      {s.items.map((it) => {
                        const m = ACTION_META[it.action] || { label: it.action, icon: ScanLine, tone: "bg-muted" };
                        const Icon = m.icon;
                        const d = it.detail || {};
                        return (
                          <li key={it.id} className="flex items-start gap-2 text-xs py-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${m.tone}`}>
                              <Icon className="w-3 h-3" /> {m.label}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {new Date(it.created_at).toLocaleTimeString("th-TH")}
                            </span>
                            <span className="flex-1 text-muted-foreground truncate">
                              {d.name && <>· {d.name}</>}
                              {d.barcode && <> · <span className="font-mono">{d.barcode}</span></>}
                              {d.duplicate_name && <> · ซ้ำกับ "{d.duplicate_name}"</>}
                              {typeof d.confidence === "number" && <> · {Math.round(d.confidence * 100)}%</>}
                              {typeof d.count === "number" && <> · {d.count} รายการ</>}
                              {d.reason && <> · {String(d.reason)}</>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StaffLayout>
  );
}