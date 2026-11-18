import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { DocCommandWorkspace } from '@/film-shop/components/commands/DocCommandWorkspace';
import { InvoiceManager } from '@/film-shop/components/invoices/InvoiceManager';
import { useAppData } from '@/film-shop/hooks/useAppData';

/**
 * หน้าหลัก “ใบเสร็จ” ของ Film Shop
 * ด้านบน = บอทออกใบเสร็จ (พิมพ์/พูด) · ด้านล่าง = ใบเสร็จจริงจากฐานข้อมูล
 */
export function ReceiptDocPage({ initialPreviewInvoiceId }: { initialPreviewInvoiceId?: string } = {}) {
  const { refetch } = useAppData() as any;
  const [botOpen, setBotOpen] = useState(true);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Card data-testid="doc-bot-panel">
        <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Bot className="h-5 w-5 text-primary" /> บอทออกใบเสร็จ (พิมพ์หรือพูดภาษาไทย)
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setBotOpen((v) => !v)}>
            {botOpen ? <><ChevronUp className="mr-1 h-4 w-4" /> ย่อบอท</> : <><ChevronDown className="mr-1 h-4 w-4" /> เปิดบอท</>}
          </Button>
        </CardHeader>
        {botOpen && (
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              ตัวอย่างคำสั่ง:
              <br />• “ออกใบเสร็จ คุณสมหญิง ถ่ายรูปติดบัตร 6 รูป 120 บาท เคลือบบัตร 30 บาท รับเงินสด”
              <br />• “ออกใบเสร็จ โรงเรียนบ้านกอก ถ่ายเอกสาร 500 แผ่น แผ่นละ 1 บาท โอนจ่าย”
              <br />ทุกคำสั่งจะแสดงตัวอย่างให้ตรวจและแก้ไขก่อน — ออกเลขจริงเมื่อกด “ยืนยันออกเอกสาร” เท่านั้น
            </div>
            <DocCommandWorkspace
              initialShopKey="film"
              initialDocType="receipt"
              docTypeOptions={['receipt']}
              onIssued={() => { void refetch?.(); }}
            />
          </CardContent>
        )}
      </Card>

      <InvoiceManager initialPreviewInvoiceId={initialPreviewInvoiceId} />
    </div>
  );
}

export default ReceiptDocPage;
