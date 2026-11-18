import { supabase } from '@/integrations/supabase/client';

export interface DocIssuedInfo {
  docNo: string;
  docTypeLabel: string;
  shopLabel: string;
  shopKey?: string | null;
  customerName?: string | null;
  total: number;
  invoiceId?: string | null;
}

export const docBookLink = (docNo: string) =>
  `/film-shop/app?p=receipts&book=1&doc=${encodeURIComponent(docNo)}`;

const baht = (n: number) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แจ้งเตือนเมื่อออกเลขเอกสารสำเร็จ — ส่งเข้ากลุ่ม LINE แอดมินของร้านเท่านั้น
 * (ยกเลิกการยิงเข้าศูนย์แจ้งเตือนในระบบแล้ว เพื่อไม่ให้แจ้งเตือนงานปริ้นของร้านนัฐภรณ์รกหน้าจอ)
 */
export async function notifyDocumentIssued(info: DocIssuedInfo): Promise<{ app: boolean; line: boolean }> {
  const link = docBookLink(info.docNo);
  const title = `📄 ออกเลขเอกสารสำเร็จ: ${info.docNo}`;
  const body = [
    `ประเภท: ${info.docTypeLabel}`,
    `ร้าน: ${info.shopLabel}`,
    `ลูกค้า: ${info.customerName || '-'}`,
    `ยอดสุทธิ: ${baht(info.total)} บาท`,
    `🔗 เปิดเอกสาร: https://filmyynatta.com${link}`,
  ].join('\n');

  const line = await supabase.rpc('film_raise_ops_notification', {
    p_kind: 'document_issued',
    p_severity: 'info',
    p_title: title,
    p_body: body,
    p_store_id: info.shopKey ?? null,
    p_group_no: 1,
    p_dedup_key: `doc_issued_line:${info.docNo}`,
    p_cooldown_minutes: 0,
  } as any);

  return { app: false, line: !line.error };
}

