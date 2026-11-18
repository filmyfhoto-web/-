import { forwardRef } from 'react';
import type { Invoice } from '@/film-shop/types';

const money = (n: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const DOC_TITLE: Record<string, string> = {
  job_order: 'ใบสั่งจ้าง',
  receipt: 'ใบเสร็จรับเงิน',
  quotation: 'ใบเสนอราคา',
  invoice: 'ใบวางบิล/ส่งของ',
};

/** เอกสารฉบับย่อสำหรับบันทึกเป็น PNG / PDF (ฟอนต์ไทยชัดเจน) */
export const DocSnapshot = forwardRef<HTMLDivElement, { invoice: Invoice; shopName?: string }>(
  function DocSnapshot({ invoice, shopName }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: 794,
          padding: 32,
          background: '#fff',
          color: '#111',
          fontFamily: "'Sarabun','TH Sarabun New','Noto Sans Thai',sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{shopName || 'ณัฐฐา ฟิล์ม'}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {DOC_TITLE[invoice.type] ?? 'เอกสาร'}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 12 }}>
          <div>
            <div>ลูกค้า: {invoice.customerName}</div>
            {invoice.customerPhone && <div>โทร: {invoice.customerPhone}</div>}
            {invoice.customerAddress && <div>ที่อยู่: {invoice.customerAddress}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>เลขที่: {invoice.invoiceNumber}</div>
            <div>
              วันที่:{' '}
              {new Date(invoice.documentDate || invoice.createdAt).toLocaleDateString('th-TH')}
            </div>
            {invoice.referenceDoc && <div>อ้างอิง: {invoice.referenceDoc}</div>}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ border: '1px solid #cbd5e1', padding: 6, textAlign: 'left' }}>รายการ</th>
              <th style={{ border: '1px solid #cbd5e1', padding: 6, width: 70 }}>จำนวน</th>
              <th style={{ border: '1px solid #cbd5e1', padding: 6, width: 60 }}>หน่วย</th>
              <th style={{ border: '1px solid #cbd5e1', padding: 6, width: 90 }}>ราคา</th>
              <th style={{ border: '1px solid #cbd5e1', padding: 6, width: 100 }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((it: any, i: number) => (
              <tr key={it.id ?? i}>
                <td style={{ border: '1px solid #e2e8f0', padding: 6 }}>{it.name}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{it.quantity}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'center' }}>{it.unit ?? 'ชิ้น'}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>
                  {money(it.pricePerPiece ?? it.pricePerSqm ?? 0)}
                </td>
                <td style={{ border: '1px solid #e2e8f0', padding: 6, textAlign: 'right' }}>{money(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, fontSize: 14, textAlign: 'right' }}>
          <div>รวมเป็นเงิน: {money(invoice.subtotal)} บาท</div>
          {!!invoice.discount && <div>ส่วนลด: {money(invoice.discount)} บาท</div>}
          {!!invoice.deposit && <div>มัดจำ: {money(invoice.deposit)} บาท</div>}
          <div style={{ fontWeight: 700, fontSize: 16 }}>ยอดรวมสุทธิ: {money(invoice.total)} บาท</div>
          {invoice.amountDue > 0 && <div>ค้างชำระ: {money(invoice.amountDue)} บาท</div>}
        </div>
        {invoice.notes && <div style={{ marginTop: 12, fontSize: 13 }}>หมายเหตุ: {invoice.notes}</div>}
      </div>
    );
  },
);

export default DocSnapshot;
