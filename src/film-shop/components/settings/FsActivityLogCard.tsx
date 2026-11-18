import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csv';
import {
  FS_ACTIVITY_CATEGORY_LABEL,
  FS_ACTIVITY_CSV_COLUMNS,
  FS_ACTIVITY_EVENT,
  clearFsActivity,
  fsActivityToRows,
  loadFsActivity,
  type FsActivityEntry,
} from '@/film-shop/lib/fsActivityLog';

const CATEGORY_STYLE: Record<string, string> = {
  sound_settings: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  order_simulation: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  notification: 'bg-accent/60 text-primary dark:text-primary-foreground',
};

/** ประวัติกิจกรรม: ตั้งค่าเสียง · จำลองออเดอร์ · ยิงแจ้งเตือน พร้อมดาวน์โหลด CSV */
export function FsActivityLogCard() {
  const [rows, setRows] = useState<FsActivityEntry[]>([]);

  const refresh = useCallback(() => setRows(loadFsActivity()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(FS_ACTIVITY_EVENT, refresh);
    return () => window.removeEventListener(FS_ACTIVITY_EVENT, refresh);
  }, [refresh]);

  const handleDownload = () => {
    if (!rows.length) {
      toast.error('ยังไม่มีกิจกรรมให้ดาวน์โหลด');
      return;
    }
    downloadCsv(
      `fs-activity-log-${new Date().toISOString().slice(0, 10)}`,
      fsActivityToRows(rows),
      FS_ACTIVITY_CSV_COLUMNS,
      undefined,
      { storeName: 'FS · FILM SHOP', subtitle: 'ประวัติกิจกรรม: ตั้งค่าเสียง · จำลองออเดอร์ · แจ้งเตือน' },
    );
    toast.success('ดาวน์โหลด CSV เรียบร้อย');
  };

  return (
    <Card data-testid="fs-activity-log">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> ประวัติกิจกรรม
          </CardTitle>
          <CardDescription>
            บันทึกการตั้งค่าเสียงแจ้งเตือน การจำลองออเดอร์ และการยิงแจ้งเตือน (เก็บในเครื่องนี้ สูงสุด 500 รายการ)
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleDownload} data-testid="fs-activity-download">
            <Download className="mr-1 h-4 w-4" /> ดาวน์โหลด CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { clearFsActivity(); toast.success('ล้างประวัติแล้ว'); }}
            disabled={!rows.length}
          >
            <Trash2 className="mr-1 h-4 w-4" /> ล้าง
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีกิจกรรม</p>
        ) : (
          <ul className="max-h-[360px] space-y-1.5 overflow-y-auto">
            {rows.map((e) => (
              <li key={e.id} className="rounded-md border px-2.5 py-1.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className={CATEGORY_STYLE[e.category] ?? ''}>
                    {FS_ACTIVITY_CATEGORY_LABEL[e.category] ?? e.category}
                  </Badge>
                  <span className="text-xs font-medium">{e.action}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(e.at).toLocaleString('th-TH')}
                  </span>
                </div>
                {Object.keys(e.detail ?? {}).length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {Object.entries(e.detail)
                      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                      .join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
