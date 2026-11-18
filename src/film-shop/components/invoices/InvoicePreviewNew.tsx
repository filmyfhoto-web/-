import { Invoice, ShopSettings } from '@/film-shop/types';
import { DocumentPrintPreview, PrintSettings, PaperSize } from '@/film-shop/components/print/DocumentPrintPreview';
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useProductCategories } from '@/film-shop/hooks/useProductCategories';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadDocPrefs, type DocKind } from '@/film-shop/lib/printColumnPrefs';

/** คอลัมน์ขนาด/ราคาต่อหน่วยของใบเสร็จ Film Shop เปิด-ปิดได้จากแผง "คอลัมน์ที่แสดง" */

export type CopyType = 'customer' | 'shop' | undefined;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const typeLabels = {
  quotation: 'ใบเสนอราคา',
  invoice: 'ใบวางบิล / ใบส่งของ',
  receipt: 'ใบเสร็จรับเงิน',
};

interface InvoicePreviewNewProps {
  invoice: Invoice;
  settings: ShopSettings;
  onClose: () => void;
  copyType?: CopyType;
  initialPaperSize?: PaperSize;
}

type InvoiceVariant = 'billing' | 'delivery';
type PrintMode = 'both' | 'billing' | 'delivery';

export function InvoicePreviewNew({ invoice, settings, onClose, copyType, initialPaperSize }: InvoicePreviewNewProps) {
  const [overrideDate, setOverrideDate] = useState<Date>(new Date(invoice.documentDate || invoice.createdAt));
  const docKind: DocKind = (['quotation', 'invoice', 'receipt'] as const).includes(invoice.type as any)
    ? (invoice.type as DocKind)
    : 'other';
  const [printSettings, setPrintSettings] = useState<PrintSettings>(() => ({
    paperSize: initialPaperSize ?? 'A4',
    fontSize: 100,
    ...loadDocPrefs(docKind, invoice.invoiceNumber),
  }));
  const { categories } = useProductCategories();
  const categoryMap = useMemo(() => {
    const m: Record<string, { name: string; color: string }> = {};
    categories.forEach(c => { m[c.key] = { name: c.name, color: c.color }; });
    return m;
  }, [categories]);
  const hasAnyCategory = invoice.items.some(i => i.category && categoryMap[i.category]);

  const isInvoice = invoice.type === 'invoice';
  const [viewVariant, setViewVariant] = useState<InvoiceVariant>('billing');
  const [printMode, setPrintMode] = useState<PrintMode>('both');

  const quotationHeader = invoice.type === 'quotation'
    ? (invoice.headerText || settings.quotationHeaderText || '')
    : '';

  const handleSettingsChange = useCallback((newSettings: PrintSettings) => {
    setPrintSettings(newSettings);
  }, []);

  const hasItemsWithDimensions = invoice.items.some(item => item.width > 0 && item.height > 0);

  /** สรุปราคาก่อนพิมพ์ คำนวณจากคอลัมน์ที่เปิดอยู่เท่านั้น */
  const preSummary = useMemo(() => {
    let byPiece = 0;
    let bySqm = 0;
    let area = 0;
    invoice.items.forEach((it) => {
      const qty = Number(it.quantity) || 0;
      const a = (Number(it.width) || 0) * (Number(it.height) || 0) * qty;
      area += a;
      byPiece += (Number(it.pricePerPiece) || 0) * qty;
      bySqm += (Number(it.pricePerSqm) || 0) * a;
    });
    return { byPiece, bySqm, area };
  }, [invoice.items]);

  const handleExportExcel = useCallback(() => {
    const BOM = '\uFEFF';
    const headers = ['ลำดับ', 'รายการ', 'ราคาต่อหน่วย', 'ราคา ตร.ม.', 'จำนวน', 'หน่วย', 'กว้าง', 'ยาว', 'รวม'];
    const escCsv = (val: string | number) => {
      const s = String(val);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = invoice.items.map((item, i) => [
      i + 1, escCsv(item.name),
      formatCurrency(item.pricePerPiece), formatCurrency(item.pricePerSqm),
      item.quantity, item.unit || 'ชิ้น',
      item.width > 0 ? item.width : '-',
      item.height > 0 ? item.height : '-',
      formatCurrency(item.total),
    ].join(','));
    rows.push('');
    rows.push(['', 'รวมเป็นเงิน', '', '', '', '', '', '', formatCurrency(invoice.subtotal)].join(','));
    if (invoice.discount > 0) rows.push(['', 'ส่วนลด', '', '', '', '', '', '', formatCurrency(invoice.discount)].join(','));
    if (invoice.deposit > 0) rows.push(['', 'วางมัดจำ', '', '', '', '', '', '', formatCurrency(invoice.deposit)].join(','));
    rows.push(['', 'รวมสุทธิ', '', '', '', '', '', '', formatCurrency(invoice.total)].join(','));
    const csv = BOM + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${typeLabels[invoice.type]}-${invoice.invoiceNumber}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success('ส่งออก Excel สำเร็จ');
  }, [invoice]);

  const renderDocBody = (docTitle: string) => (
    <>
      {/* สรุปราคาก่อนพิมพ์ — คำนวณตามคอลัมน์ที่เปิดอยู่ (ไม่พิมพ์ออกกระดาษ) */}
      <div className="no-print" style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
        padding: '10px 12px', marginBottom: '12px',
        background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px',
        fontSize: '12px', color: '#0f172a',
      }}>
        <strong style={{ color: '#1e40af' }}>สรุปก่อนพิมพ์</strong>
        {printSettings.showPricePerPiece && (
          <span>รวมตามราคา/หน่วย: <strong>{formatCurrency(preSummary.byPiece)}</strong> บาท</span>
        )}
        {printSettings.showPricePerSqm && (
          <span>รวมตามราคา/ตร.ม.: <strong>{formatCurrency(preSummary.bySqm)}</strong> บาท</span>
        )}
        {printSettings.showArea && (
          <span>พื้นที่รวม: <strong>{formatCurrency(preSummary.area)}</strong> ตร.ม.</span>
        )}
        {!printSettings.showPricePerPiece && !printSettings.showPricePerSqm && !printSettings.showArea && (
          <span style={{ color: '#64748b' }}>ยังไม่ได้เปิดคอลัมน์ราคา/ขนาด</span>
        )}
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>ยอดสุทธิเอกสาร: <strong>{formatCurrency(invoice.total)}</strong> บาท</span>
      </div>

      {/* Copy Type Header */}
      {copyType && (
        <div
          style={{
            textAlign: 'center', padding: '8px', marginBottom: '10px',
            backgroundColor: copyType === 'customer' ? '#dbeafe' : '#ffedd5',
            borderRadius: '8px', fontWeight: 'bold', fontSize: '14px',
            color: copyType === 'customer' ? '#1e40af' : '#c2410c',
          }}
        >
          {copyType === 'customer' ? '📋 สำเนาลูกค้า / Customer Copy' : '📋 สำเนาร้าน / Shop Copy'}
        </div>
      )}

      {/* Shop Header */}
      <div className="header" style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1e40af', paddingBottom: '15px' }}>
        <div className="shop-name" style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af' }}>{settings.shopName}</div>
        <div className="shop-info" style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
          {settings.shopAddress}<br />
          โทร: {settings.shopPhone} | เลขประจำตัวผู้เสียภาษี: {settings.shopTaxId}
        </div>
      </div>

      {/* Document Title */}
      <div className="doc-title" style={{ fontSize: '18px', fontWeight: 'bold', margin: '20px 0', textAlign: 'center', color: '#1e40af' }}>
        {docTitle}
      </div>

      {/* Quotation header text */}
      {quotationHeader && (
        <div style={{
          margin: '0 0 16px',
          padding: '10px 14px',
          border: '1px solid #1e40af',
          borderRadius: '6px',
          background: '#eff6ff',
          color: '#1e3a8a',
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
        }}>
          {quotationHeader}
        </div>
      )}

      {/* Info Row */}
      <div className="info-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div className="info-box" style={{ flex: 1 }}>
          <div className="info-label" style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '5px' }}>ลูกค้า</div>
          <div><strong>{invoice.customerName}</strong></div>
          {invoice.customerTaxId && (
            <div>
              เลขผู้เสียภาษี: {invoice.customerTaxId}
              {invoice.customerBranch ? ` (${invoice.customerBranch})` : ''}
            </div>
          )}
          {invoice.customerPhone && <div>โทร: {invoice.customerPhone}</div>}
          {invoice.customerAddress && <div>{invoice.customerAddress}</div>}
        </div>
        <div className="info-box" style={{ flex: 1, textAlign: 'right' }}>
          <div><strong>เลขที่:</strong> {invoice.invoiceNumber}</div>
          <div><strong>วันที่:</strong> {formatDate(overrideDate)}</div>
          {invoice.salesPerson && <div><strong>พนักงาน:</strong> {invoice.salesPerson}</div>}
          {invoice.referenceDoc && <div><strong>อ้างอิง:</strong> {invoice.referenceDoc}</div>}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
        <thead>
          <tr>
            <th style={{ width: '40px', background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>ลำดับ</th>
            <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'left' }}>รายการ</th>
            {hasAnyCategory && (
              <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'left' }}>ประเภท</th>
            )}
            {printSettings.showPricePerPiece && (
              <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'right' }}>ราคาต่อหน่วย</th>
            )}
            {printSettings.showPricePerSqm && (
              <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'right' }}>ราคา ตร.ม.</th>
            )}
            <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>จำนวน</th>
            <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>หน่วย</th>
            {printSettings.showArea && (
              <>
                <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>กว้าง</th>
                <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>ยาว</th>
              </>
            )}
            <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'right' }}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => {
            const cat = item.category ? categoryMap[item.category] : null;
            return (
              <tr key={item.id} style={{ background: index % 2 === 1 ? '#f8fafc' : 'white' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{index + 1}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>{item.name}</td>
                {hasAnyCategory && (
                  <td style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>
                    {cat ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
                        background: cat.color, color: '#1f2937', fontSize: '11px', fontWeight: 600,
                      }}>{cat.name}</span>
                    ) : '-'}
                  </td>
                )}
                {printSettings.showPricePerPiece && (
                  <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                    {item.pricePerPiece > 0 ? formatCurrency(item.pricePerPiece) : '-'}
                  </td>
                )}
                {printSettings.showPricePerSqm && (
                  <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>
                    {item.pricePerSqm > 0 ? formatCurrency(item.pricePerSqm) : '-'}
                  </td>
                )}
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.unit || 'ชิ้น'}</td>
                {printSettings.showArea && (
                  <>
                    <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>
                      {item.width > 0 ? item.width : '-'}
                    </td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>
                      {item.height > 0 ? item.height : '-'}
                    </td>
                  </>
                )}
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary */}
      <div className="summary" style={{ marginTop: '20px', textAlign: 'right' }}>
        <div className="summary-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
          <span className="summary-label" style={{ minWidth: '120px', textAlign: 'right' }}>รวมเป็นเงิน</span>
          <span className="summary-value" style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(invoice.subtotal)} บาท</span>
        </div>
        {invoice.deposit > 0 && (
          <div className="summary-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
            <span className="summary-label" style={{ minWidth: '120px', textAlign: 'right' }}>วางมัดจำ</span>
            <span className="summary-value" style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(invoice.deposit)} บาท</span>
          </div>
        )}
        {invoice.discount > 0 && (
          <div className="summary-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
            <span className="summary-label" style={{ minWidth: '120px', textAlign: 'right' }}>ส่วนลด</span>
            <span className="summary-value" style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(invoice.discount)} บาท</span>
          </div>
        )}
        <div className="summary-row total-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0', fontSize: '16px', fontWeight: 'bold', borderTop: '2px solid #1e40af', paddingTop: '10px', marginTop: '10px', color: '#1e40af' }}>
          <span className="summary-label" style={{ minWidth: '120px', textAlign: 'right' }}>รวมสุทธิ</span>
          <span className="summary-value" style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(invoice.total)} บาท</span>
        </div>
        {invoice.amountDue > 0 && (
          <div className="summary-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
            <span className="summary-label" style={{ minWidth: '120px', textAlign: 'right' }}>คงค้างต้องชำระ</span>
            <span className="summary-value" style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>{formatCurrency(invoice.amountDue)} บาท</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="notes" style={{ marginTop: '30px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
          <div className="notes-title" style={{ fontWeight: 'bold', color: '#1e40af' }}>หมายเหตุ</div>
          <div>{invoice.notes}</div>
        </div>
      )}

      {/* Footer */}
      <div className="footer" style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
        <div className="signature-box" style={{ textAlign: 'center', paddingTop: '50px' }}>
          <div className="signature-line" style={{ width: '150px', borderTop: '1px solid #333', margin: '0 auto 5px' }}></div>
          <div>ผู้รับเงิน</div>
          <div style={{ fontSize: '10px', color: '#666' }}>{settings.shopName}</div>
        </div>
      </div>

      {/* Receipt Footer */}
      {settings.receiptFooter && (
        <div style={{ textAlign: 'center', marginTop: '30px', color: '#666', fontSize: '11px' }}>
          {settings.receiptFooter}
        </div>
      )}
    </>
  );

  // Build dynamic visibility CSS for invoice dual-page mode
  const dualCss = isInvoice ? `
    @media screen {
      .doc-page[data-variant="${viewVariant === 'billing' ? 'delivery' : 'billing'}"] { display: none; }
    }
    @media print {
      ${printMode === 'billing' ? '.doc-page[data-variant="delivery"] { display: none; }' : ''}
      ${printMode === 'delivery' ? '.doc-page[data-variant="billing"] { display: none; }' : ''}
      ${printMode === 'both' ? '.doc-page[data-variant="delivery"] { page-break-before: always; }' : ''}
    }
  ` : '';

  return (
    <DocumentPrintPreview
      title={isInvoice ? 'ใบวางบิล + ใบส่งของ' : typeLabels[invoice.type]}
      documentNumber={invoice.invoiceNumber}
      onClose={onClose}
      docKind={docKind}
      showAreaColumn={true}
      showPriceColumns={true}
      onSettingsChange={handleSettingsChange}
      onExportExcel={handleExportExcel}
      documentDate={overrideDate}
      onDocumentDateChange={setOverrideDate}
      attachments={invoice.attachments as any}
      initialPaperSize={initialPaperSize}
    >
      {isInvoice ? (
        <>
          {/* Variant Toolbar — screen only */}
          <div className="no-print" style={{
            display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
            padding: '10px 12px', marginBottom: '12px',
            background: '#f1f5f9', borderRadius: '8px', border: '1px dashed #cbd5e1',
          }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Label className="text-xs whitespace-nowrap">แสดงตัวอย่าง:</Label>
              <Select value={viewVariant} onValueChange={(v) => setViewVariant(v as InvoiceVariant)}>
                <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="billing">ใบวางบิล</SelectItem>
                  <SelectItem value="delivery">ใบส่งของ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Label className="text-xs whitespace-nowrap">เวลาพิมพ์:</Label>
              <Select value={printMode} onValueChange={(v) => setPrintMode(v as PrintMode)}>
                <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">ทั้งคู่ (ใบวางบิล + ใบส่งของ)</SelectItem>
                  <SelectItem value="billing">เฉพาะใบวางบิล</SelectItem>
                  <SelectItem value="delivery">เฉพาะใบส่งของ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <style>{dualCss}</style>
          <div className="doc-page" data-variant="billing">
            {renderDocBody('ใบวางบิล / Invoice')}
          </div>
          <div className="doc-page" data-variant="delivery">
            {renderDocBody('ใบส่งของ / Delivery Note')}
          </div>
        </>
      ) : (
        renderDocBody(typeLabels[invoice.type])
      )}
    </DocumentPrintPreview>
  );
}
