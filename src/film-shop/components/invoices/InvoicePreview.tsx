import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Invoice, ShopSettings } from '@/film-shop/types';
import { ArrowLeft, Printer, Settings2, Copy } from 'lucide-react';
import { openPrintWindowOrSurface, printWhenFontsReady, PRINT_FONT_HEAD } from "@/lib/printSurface";
import { PaperViewport } from '@/components/print/PaperViewport';

type CopyType = 'customer' | 'shop' | undefined;

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
  invoice: 'ใบวางบิล/ใบส่งของ',
  receipt: 'ใบเสร็จรับเงิน',
};

interface InvoicePreviewProps {
  invoice: Invoice;
  settings: ShopSettings;
  onClose: () => void;
}

export function InvoicePreview({ invoice, settings, onClose }: InvoicePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  
  // Print settings
  const [fontSize, setFontSize] = useState(100);
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [copyType, setCopyType] = useState<CopyType>(undefined);
  
  // Column visibility
  const [showPricePerSqm, setShowPricePerSqm] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [showPricePerPiece, setShowPricePerPiece] = useState(true);

  const handlePrint = (type?: CopyType) => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = openPrintWindowOrSurface();
    if (!printWindow) return;

    const copyLabel = type === 'customer' ? 'สำเนาลูกค้า' : type === 'shop' ? 'ต้นฉบับร้านค้า' : '';
    const copyColor = type === 'customer' ? '#2563eb' : type === 'shop' ? '#16a34a' : '#1e40af';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${typeLabels[invoice.type]} - ${invoice.invoiceNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4; margin: 15mm; }
            body { 
              font-family: 'IBM Plex Sans Thai', 'Sarabun', sans-serif; 
              font-size: ${fontSize * 0.12}px; 
              line-height: 1.5;
              color: #333;
            }
            .invoice-container { 
              max-width: 210mm; 
              margin: 0 auto; 
              padding: 20px;
            }
            .copy-badge {
              position: absolute;
              top: 10px;
              right: 10px;
              background: ${copyColor};
              color: white;
              padding: 5px 15px;
              font-size: 12px;
              font-weight: bold;
              border-radius: 4px;
            }
            .header { 
              text-align: center; 
              margin-bottom: 20px;
              border-bottom: 2px solid ${copyColor};
              padding-bottom: 15px;
              position: relative;
            }
            .shop-name { font-size: ${fontSize * 0.24}px; font-weight: bold; color: ${copyColor}; }
            .shop-info { font-size: ${fontSize * 0.11}px; color: #666; margin-top: 5px; }
            .doc-title { 
              font-size: ${fontSize * 0.18}px; 
              font-weight: bold; 
              margin: 20px 0;
              text-align: center;
              color: ${copyColor};
            }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .info-box { flex: 1; }
            .info-label { font-weight: bold; color: ${copyColor}; margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { 
              background: ${copyColor}; 
              color: white; 
              padding: 10px; 
              text-align: left;
              font-weight: 600;
            }
            th:nth-child(n+3) { text-align: center; }
            th:last-child { text-align: right; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            td:nth-child(n+3) { text-align: center; }
            td:last-child { text-align: right; }
            tr:nth-child(even) { background: #f8fafc; }
            .summary { 
              margin-top: 20px; 
              text-align: right;
            }
            .summary-row { 
              display: flex; 
              justify-content: flex-end; 
              gap: 20px;
              padding: 5px 0;
            }
            .summary-label { min-width: 120px; text-align: right; }
            .summary-value { min-width: 100px; text-align: right; font-weight: 600; }
            .total-row { 
              font-size: ${fontSize * 0.16}px; 
              font-weight: bold;
              border-top: 2px solid ${copyColor};
              padding-top: 10px;
              margin-top: 10px;
              color: ${copyColor};
            }
            .notes { 
              margin-top: 30px; 
              padding: 15px; 
              background: #f8fafc; 
              border-radius: 8px;
            }
            .notes-title { font-weight: bold; color: ${copyColor}; }
            .footer { 
              margin-top: 40px; 
              display: flex; 
              justify-content: space-between;
            }
            .signature-box { 
              text-align: center;
              padding-top: 50px;
            }
            .signature-line { 
              width: 150px; 
              border-top: 1px solid #333;
              margin: 0 auto 5px;
            }
            .hidden-col { display: none; }
          </style>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; img-src 'self' data:;">
          ${PRINT_FONT_HEAD}
        </head>
        <body>
          ${type ? `<div class="copy-badge">${copyLabel}</div>` : ''}
          ${content.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      void printWhenFontsReady(printWindow).then(() => printWindow.close());
    };
  };

  const handlePrintBothCopies = async () => {
    // Print customer copy first
    handlePrint('customer');
    
    // Wait a bit then print shop copy
    setTimeout(() => {
      handlePrint('shop');
    }, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          กลับ
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowPrintSettings(!showPrintSettings)}>
            <Settings2 className="h-4 w-4" />
            ตั้งค่าพิมพ์
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4" />
            พิมพ์
          </Button>
          <Button onClick={handlePrintBothCopies}>
            <Copy className="h-4 w-4 mr-1" />
            พิมพ์ 2 ก็อปปี้
          </Button>
        </div>
      </div>
      
      {/* Print Settings Panel */}
      {showPrintSettings && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">ขนาดตัวอักษร: {fontSize}%</Label>
                <Slider
                  value={[fontSize]}
                  onValueChange={(value) => setFontSize(value[0])}
                  min={70}
                  max={150}
                  step={5}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-3 block">คอลัมน์ที่แสดง</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="showPricePerSqm" 
                    checked={showPricePerSqm} 
                    onCheckedChange={(v) => setShowPricePerSqm(!!v)} 
                  />
                  <Label htmlFor="showPricePerSqm" className="text-sm cursor-pointer">ราคา/ตร.ม.</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="showArea" 
                    checked={showArea} 
                    onCheckedChange={(v) => setShowArea(!!v)} 
                  />
                  <Label htmlFor="showArea" className="text-sm cursor-pointer">ขนาด (กว้าง x ยาว)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="showPricePerPiece" 
                    checked={showPricePerPiece} 
                    onCheckedChange={(v) => setShowPricePerPiece(!!v)} 
                  />
                  <Label htmlFor="showPricePerPiece" className="text-sm cursor-pointer">ราคา/หน่วย</Label>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setFontSize(100);
                  setShowPricePerSqm(true);
                  setShowArea(true);
                  setShowPricePerPiece(true);
                }}
              >
                รีเซ็ต
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="max-w-4xl mx-auto overflow-hidden">
        <CardContent className="p-0 md:p-8">
          <PaperViewport paper="A4">
          <div ref={printRef} className="invoice-container p-8" style={{ fontSize: `${fontSize}%` }}>
            {/* Header */}
            <div className="header">
              <div className="shop-name">{settings.shopName}</div>
              <div className="shop-info">
                {settings.shopAddress}<br />
                โทร: {settings.shopPhone} | เลขประจำตัวผู้เสียภาษี: {settings.shopTaxId}
              </div>
            </div>

            {/* Document Title */}
            <div className="doc-title">{typeLabels[invoice.type]}</div>

            {/* Info Row */}
            <div className="info-row">
              <div className="info-box">
                <div className="info-label">ลูกค้า</div>
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
              <div className="info-box" style={{ textAlign: 'right' }}>
                <div><strong>เลขที่:</strong> {invoice.invoiceNumber}</div>
                <div><strong>วันที่:</strong> {formatDate(invoice.documentDate || invoice.createdAt)}</div>
                {invoice.salesPerson && <div><strong>พนักงาน:</strong> {invoice.salesPerson}</div>}
                {invoice.referenceDoc && <div><strong>อ้างอิง:</strong> {invoice.referenceDoc}</div>}
              </div>
            </div>

            {/* Items Table */}
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>ลำดับ</th>
                  <th>รายการ</th>
                  {showPricePerPiece && <th>ราคาต่อหน่วย</th>}
                  {showPricePerSqm && <th>ราคา ตร.ม.</th>}
                  <th>จำนวน</th>
                  <th>หน่วย</th>
                  {showArea && <th>กว้าง</th>}
                  {showArea && <th>ยาว</th>}
                  <th>รวม</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'center' }}>{index + 1}</td>
                    <td>{item.name}</td>
                    {showPricePerPiece && <td style={{ textAlign: 'right' }}>{item.pricePerPiece ? formatCurrency(item.pricePerPiece) : '-'}</td>}
                    {showPricePerSqm && <td style={{ textAlign: 'right' }}>{item.pricePerSqm ? formatCurrency(item.pricePerSqm) : '-'}</td>}
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'center' }}>{item.unit || '-'}</td>
                    {showArea && <td style={{ textAlign: 'center' }}>{item.width || '-'}</td>}
                    {showArea && <td style={{ textAlign: 'center' }}>{item.height || '-'}</td>}
                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            <div className="summary">
              <div className="summary-row">
                <span className="summary-label">รวมเป็นเงิน</span>
                <span className="summary-value">{formatCurrency(invoice.subtotal)} บาท</span>
              </div>
              {invoice.deposit > 0 && (
                <div className="summary-row">
                  <span className="summary-label">วางมัดจำ</span>
                  <span className="summary-value">{formatCurrency(invoice.deposit)} บาท</span>
                </div>
              )}
              {invoice.discount > 0 && (
                <div className="summary-row">
                  <span className="summary-label">ส่วนลด</span>
                  <span className="summary-value">{formatCurrency(invoice.discount)} บาท</span>
                </div>
              )}
              <div className="summary-row total-row">
                <span className="summary-label">รวมสุทธิ</span>
                <span className="summary-value">{formatCurrency(invoice.total)} บาท</span>
              </div>
              {invoice.amountDue > 0 && (
                <div className="summary-row">
                  <span className="summary-label">คงค้างต้องชำระ</span>
                  <span className="summary-value" style={{ color: '#f59e0b' }}>{formatCurrency(invoice.amountDue)} บาท</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="notes">
                <div className="notes-title">หมายเหตุ</div>
                <div>{invoice.notes}</div>
              </div>
            )}

            {/* Attachments (read-only list) */}
            {Array.isArray(invoice.attachments) && invoice.attachments.length > 0 && (
              <div className="notes" style={{ marginTop: '10px' }}>
                <div className="notes-title">ไฟล์แนบ ({invoice.attachments.length})</div>
                <ol style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
                  {invoice.attachments.map((a: any, i: number) => (
                    <li key={i} style={{ fontSize: '12px' }}>
                      {a?.name || `ไฟล์ ${i + 1}`}
                      {typeof a?.size === 'number' && a.size > 0 && (
                        <span style={{ color: '#666' }}> ({a.size >= 1024 * 1024 ? `${(a.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1024))} KB`})</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Footer */}
            <div className="footer" style={{ justifyContent: 'flex-end' }}>
              <div className="signature-box">
                <div className="signature-line"></div>
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
          </div>
          </PaperViewport>
        </CardContent>
      </Card>
    </div>
  );
}
