/**
 * การ์ดล่าง "ตรวจพบข้อมูลจากไฟล์" — สรุปผลอ่านเป็นข้อ ๆ ทีละหมวด
 * ผู้ใช้ต้องกด "ใช้ข้อมูลนี้" เองเท่านั้น จึงจะเติมลงฟอร์มเดิม (ไม่สร้างคิว/เอกสารอัตโนมัติ)
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildExtractPages, extractFoundCount, NOT_FOUND_TEXT, type ExtractedIntake } from '@/film-shop/lib/fileIntakeExtract';

export type ExtractStatus = 'reading' | 'done' | 'error';

export interface ExtractedDataSheetProps {
  open: boolean;
  status: ExtractStatus;
  result: ExtractedIntake | null;
  error?: string | null;
  onRetry: () => void;
  onUse: (r: ExtractedIntake) => void;
  onEdit: () => void;
  onOpenChange: (v: boolean) => void;
}

export default function ExtractedDataSheet(props: ExtractedDataSheetProps) {
  const { open, status, result, error, onRetry, onUse, onEdit, onOpenChange } = props;
  const [page, setPage] = useState(0);
  const pages = useMemo(() => (result ? buildExtractPages(result) : []), [result]);
  const last = page >= pages.length - 1;

  /** เปิดใหม่/ผลอ่านใหม่ ต้องกลับหน้า 1 เสมอ */
  useEffect(() => { setPage(0); }, [result, status === 'reading', open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4"
        data-testid="extract-sheet">
        <SheetHeader className="text-left">
          <SheetTitle>ตรวจพบข้อมูลจากไฟล์</SheetTitle>
          <SheetDescription>
            {status === 'reading' && 'กำลังอ่านไฟล์…'}
            {status === 'error' && 'อ่านไฟล์ไม่ได้'}
            {status === 'done' && result &&
              `${result.sourceName} · พบ ${extractFoundCount(result)} ข้อ · ตรวจสอบก่อนใช้ได้ค่ะ`}
          </SheetDescription>
        </SheetHeader>

        {status === 'reading' && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" /> กำลังอ่านไฟล์…
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 py-8 text-sm" role="alert">
            <p className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error || 'อ่านไฟล์ไม่ได้'}
            </p>
            <p className="text-muted-foreground">กรอกข้อมูลเองก็ได้ค่ะ ข้อมูลในฟอร์มยังอยู่ครบ</p>
            <Button variant="outline" className="w-full" onClick={onRetry} data-testid="extract-retry">
              <RotateCcw className="mr-1 h-4 w-4" /> ลองอีกครั้ง
            </Button>
            <Button className="w-full" onClick={onEdit} data-testid="extract-manual">
              กรอกข้อมูลเอง
            </Button>
          </div>
        )}

        {status === 'done' && result && pages[page] && (
          <div className="space-y-3 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{pages[page].title}</p>
              <span className="text-xs text-muted-foreground">หน้า {page + 1}/{pages.length}</span>
            </div>
            <ul className="space-y-2">
              {pages[page].lines.map((l) => (
                <li key={l.no}
                  className={`rounded-lg border p-2 text-sm ${l.uncertain ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">{l.no}. {l.label}</span>
                    {l.uncertain && <Badge variant="outline" className="shrink-0">ไม่แน่ใจ ตรวจด้วย</Badge>}
                  </div>
                  <p className={`mt-0.5 break-words ${l.found ? 'font-medium' : 'text-muted-foreground'}`}>
                    {l.found ? l.value : NOT_FOUND_TEXT}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'done' && result && (
          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="flex-1" disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> ย้อนกลับ
            </Button>
            {!last ? (
              <Button className="flex-1" onClick={() => setPage((p) => p + 1)} data-testid="extract-next">
                ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="flex-1" onClick={onEdit}>แก้ไขก่อน</Button>
                <Button className="flex-1" data-testid="extract-use" onClick={() => onUse(result)}>ใช้ข้อมูลนี้</Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}