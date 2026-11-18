import { useEffect, useState } from 'react';
import { supabase } from '@/film-shop/lib/supabase';
import { useRealtimeWithFallback } from '@/film-shop/hooks/useRealtimeWithFallback';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Inbox, MessageSquare, CheckCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface JobRow {
  id: string;
  status: string;
  customer_name: string | null;
  title: string | null;
  description: string | null;
  linked_invoice_id: string | null;
  created_at: string;
}

const fmt = (s: string) => {
  const d = new Date(s);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface Props {
  onOpenInvoice?: (invoiceId: string) => void;
}

/**
 * Header bell that surfaces LINE job requests, lets staff peek at the
 * pasted message body, mark items as read, and jump to the linked draft
 * invoice — all in one place instead of forcing a nav to the full page.
 */
export function LineJobRequestsBell({ onOpenInvoice }: Props) {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [detail, setDetail] = useState<JobRow | null>(null);

  const load = async () => {
    const { data } = await (supabase.from('job_requests' as any) as any)
      .select('id,status,customer_name,title,description,linked_invoice_id,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setRows((data as JobRow[]) || []);
  };

  useEffect(() => { load(); }, []);
  useRealtimeWithFallback('film_job_requests', load);

  const newCount = rows.filter(r => r.status === 'new').length;

  const markRead = async (id: string) => {
    await (supabase.from('job_requests' as any) as any).update({ status: 'read' }).eq('id', id);
    load();
  };

  const markAllRead = async () => {
    await (supabase.from('job_requests' as any) as any).update({ status: 'read' }).eq('status', 'new');
    toast.success('ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว');
    load();
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="คำสั่งงานจาก LINE">
            <Inbox className="h-5 w-5" />
            {newCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {newCount > 9 ? '9+' : newCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="flex items-center justify-between border-b p-3">
            <div>
              <h4 className="font-semibold">คำสั่งงานจาก LINE</h4>
              <p className="text-xs text-muted-foreground">
                {newCount > 0 ? `${newCount} รายการใหม่` : 'อ่านครบแล้ว'}
              </p>
            </div>
            {newCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs">
                <CheckCheck className="h-3.5 w-3.5 mr-1" /> อ่านทั้งหมด
              </Button>
            )}
          </div>
          <ScrollArea className="h-[360px]">
            {rows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">ยังไม่มีคำสั่งงาน</div>
            ) : (
              <div className="divide-y">
                {rows.map((r) => (
                  <div key={r.id} className={`p-3 hover:bg-muted/50 transition ${r.status === 'new' ? 'bg-red-50/50' : ''}`}>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5"><MessageSquare className="h-4 w-4 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{r.customer_name || 'ไม่ระบุลูกค้า'}</span>
                          {r.status === 'new' && <Badge className="bg-red-500 text-white text-[10px] px-1.5">ใหม่</Badge>}
                        </div>
                        <p className="text-xs font-medium truncate">{r.title || '(ไม่มีหัวข้อ)'}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{r.description || ''}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">{fmt(r.created_at)}</span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDetail(r)}>รายละเอียด</Button>
                            {r.linked_invoice_id && onOpenInvoice && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { onOpenInvoice(r.linked_invoice_id!); markRead(r.id); }}>
                                <ExternalLink className="h-3 w-3 mr-1" /> ใบแจ้งหนี้
                              </Button>
                            )}
                            {r.status === 'new' && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => markRead(r.id)}>อ่านแล้ว</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Detail dialog — inline so we don't need a separate file. */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-background rounded-lg shadow-xl max-w-lg w-full p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">รายละเอียดคำสั่งงาน</h3>
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>ปิด</Button>
            </div>
            <div className="text-sm space-y-2">
              <div><span className="text-muted-foreground">ลูกค้า:</span> <span className="font-medium">{detail.customer_name || '-'}</span></div>
              <div><span className="text-muted-foreground">หัวข้อ:</span> <span className="font-medium">{detail.title || '-'}</span></div>
              <div><span className="text-muted-foreground">เวลา:</span> {fmt(detail.created_at)}</div>
              <div>
                <div className="text-muted-foreground mb-1">ข้อความ:</div>
                <pre className="whitespace-pre-wrap text-xs bg-muted p-3 rounded max-h-72 overflow-y-auto">{detail.description || '(ว่าง)'}</pre>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                {detail.linked_invoice_id && onOpenInvoice && (
                  <Button size="sm" onClick={() => { onOpenInvoice(detail.linked_invoice_id!); markRead(detail.id); setDetail(null); }}>
                    เปิดใบแจ้งหนี้
                  </Button>
                )}
                {detail.status === 'new' && (
                  <Button size="sm" variant="outline" onClick={() => { markRead(detail.id); setDetail(null); }}>ทำเครื่องหมายว่าอ่านแล้ว</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}