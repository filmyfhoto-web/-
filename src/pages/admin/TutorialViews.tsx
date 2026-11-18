import AdminLayout from "@/components/layout/AdminLayout";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PlayCircle, RefreshCw } from "lucide-react";
import { TUTORIAL_VIDEOS } from "@/lib/tutorialVideos";

type Row = { video_key: string; step_key: string; session_id: string; created_at: string };

/** ป้ายภาษาไทยของเหตุการณ์ปุ่ม (action:<ชื่อ>[:ช่องทาง]) */
const ACTION_LABEL: Record<string, string> = {
  play: "กดเล่น",
  "play-landscape": "เล่นแนวนอน",
  "play-portrait": "เล่นแนวตั้ง (มือถือ)",
  "download-pdf": "โหลดคู่มือ PDF",
  copy: "คัดลอกลิงก์",
  share: "แชร์",
  "share:device": "แชร์ผ่านเครื่อง",
  "share:line": "แชร์ทาง LINE",
  "share:facebook": "แชร์ Facebook",
  "share:x": "แชร์ X",
  "share:copy": "แชร์แบบคัดลอก",
  "copy:copy": "คัดลอกลิงก์",
  "download-srt": "โหลดซับ .srt",
  "download-offline": "บันทึกออฟไลน์",
  "captions-on": "เปิดคำบรรยาย",
  "captions-off": "ปิดคำบรรยาย",
};


/** รายงานยอดผู้ชมวิดีโอสอน แยกตามขั้นตอน */
export default function AdminTutorialViews() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("tutorial_video_views")
      .select("video_key, step_key, session_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.video_key}:${r.step_key}`, (m.get(`${r.video_key}:${r.step_key}`) ?? 0) + 1);
    return m;
  }, [rows]);

  return (
    <AdminLayout>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-foreground">
              <PlayCircle className="h-5 w-5" aria-hidden /> สถิติวิดีโอสอนลูกค้า
            </h1>
            <p className="text-sm text-muted-foreground">นับแบบไม่ระบุตัวตน 1 เซสชัน = 1 ครั้งต่อขั้นตอน</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        </div>

        {TUTORIAL_VIDEOS.map((v) => {
          const plays = byKey.get(`${v.key}:play`) ?? 0;
          const actions = rows
            .filter((r) => r.video_key === v.key && r.step_key.startsWith("action:"))
            .reduce<Map<string, number>>((m, r) => m.set(r.step_key.slice(7), (m.get(r.step_key.slice(7)) ?? 0) + 1), new Map());

          return (
            <div key={v.key} className="ng-card p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-bold text-foreground">{v.title}</p>
                <p className="text-sm text-muted-foreground">กดเล่น {plays} ครั้ง</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {v.chapters.map((c) => {
                  const n = byKey.get(`${v.key}:${c.key}`) ?? 0;
                  const pct = plays ? Math.round((n / plays) * 100) : 0;
                  return (
                    <div key={c.key} className="rounded-xl border border-primary/15 bg-white p-3">
                      <p className="text-sm font-semibold text-primary">{c.label}</p>
                      <p className="text-2xl font-black text-foreground">{n}</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4" data-testid={`tutorial-actions-${v.key}`}>
                <p className="text-sm font-bold text-primary">การกดปุ่ม (เล่น / แชร์ / คัดลอก / ดาวน์โหลด)</p>
                {actions.size === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">ยังไม่มีการกดปุ่มในตอนนี้</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.from(actions.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => (
                        <span key={k} className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-semibold text-primary">
                          {ACTION_LABEL[k] ?? k} · {n}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>

          );
        })}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลการรับชม</p>
        )}
      </div>
    </AdminLayout>
  );
}
