import { forwardRef } from 'react';
import { POSReceipt, CopyType } from '@/film-shop/types/pos';
import { ShopSettings } from '@/film-shop/types';

interface POSReceiptA4Props {
  receipt: POSReceipt;
  settings: ShopSettings;
  fontSize?: number;
  showPriceColumn?: boolean;
  showQtyColumn?: boolean;
  showDimensionColumn?: boolean;
  copyType?: CopyType;
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const POSReceiptA4 = forwardRef<HTMLDivElement, POSReceiptA4Props>(
  ({ receipt, settings, fontSize = 100, showPriceColumn = true, showQtyColumn = true, showDimensionColumn = true, copyType }, ref) => {
    const hasItemsWithDimensions = receipt.items.some(item => item.width && item.height);
    const baseFontSize = 12 * (fontSize / 100);

    return (
      <div
        ref={ref}
        className="bg-white text-black font-sans"
        style={{ width: '210mm', minHeight: '297mm', fontSize: `${baseFontSize}px`, lineHeight: '1.6', padding: '20mm 15mm' }}
      >
        {/* Copy Type Header */}
        {copyType && (
          <div style={{
            textAlign: 'center',
            padding: '8px',
            marginBottom: '10px',
            backgroundColor: copyType === 'customer' ? '#dbeafe' : '#ffedd5',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            color: copyType === 'customer' ? '#1e40af' : '#c2410c',
          }}>
            {copyType === 'customer' ? '📋 สำเนาลูกค้า / Customer Copy' : '📋 สำเนาร้าน / Shop Copy'}
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1e40af', paddingBottom: '15px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e40af' }}>{settings.shopName}</div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
            {settings.shopAddress}<br />
            โทร: {settings.shopPhone} | เลขประจำตัวผู้เสียภาษี: {settings.shopTaxId}
          </div>
        </div>

        {/* Document Title */}
        <div style={{ fontSize: '18px', fontWeight: 'bold', margin: '20px 0', textAlign: 'center', color: '#1e40af' }}>
          ใบเสร็จรับเงิน
        </div>

        {/* Info Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '5px' }}>ลูกค้า</div>
            <div><strong>{receipt.customerName || '-'}</strong></div>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div><strong>เลขที่:</strong> {receipt.receiptNumber}</div>
            <div><strong>วันที่:</strong> {formatDate(receipt.receiptDate)}</div>
            <div><strong>การชำระ:</strong> {receipt.paymentType === 'cash' ? 'เงินสด' : receipt.paymentType === 'transfer' ? 'เงินโอน' : 'ลงบัญชี'}</div>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '20px 0' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>ลำดับ</th>
              <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'left' }}>รายการ</th>
              {showDimensionColumn && hasItemsWithDimensions && (
                <>
                  <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>กว้าง</th>
                  <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>ยาว</th>
                </>
              )}
              {showQtyColumn && <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>จำนวน</th>}
              {showQtyColumn && <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'center' }}>หน่วย</th>}
              {showPriceColumn && <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'right' }}>ราคา/หน่วย</th>}
              <th style={{ background: '#1e40af', color: 'white', padding: '10px', textAlign: 'right' }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={item.id} style={{ background: index % 2 === 1 ? '#f8fafc' : 'white' }}>
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{index + 1}</td>
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd' }}>{item.name}</td>
                {showDimensionColumn && hasItemsWithDimensions && (
                  <>
                    <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.width || '-'}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.height || '-'}</td>
                  </>
                )}
                {showQtyColumn && <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.quantity}</td>}
                {showQtyColumn && <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>{item.unit}</td>}
                {showPriceColumn && <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right' }}>{formatCurrency(item.price)}</td>}
                <td style={{ padding: '10px', borderBottom: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
            <span style={{ minWidth: '120px', textAlign: 'right' }}>รวมเป็นเงิน</span>
            <span style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(receipt.subtotal)} บาท</span>
          </div>
          {receipt.deposit > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
              <span style={{ minWidth: '120px', textAlign: 'right' }}>วางมัดจำ</span>
              <span style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(receipt.deposit)} บาท</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0', fontSize: '16px', fontWeight: 'bold', borderTop: '2px solid #1e40af', paddingTop: '10px', marginTop: '10px', color: '#1e40af' }}>
            <span style={{ minWidth: '120px', textAlign: 'right' }}>รวมสุทธิ</span>
            <span style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(receipt.total)} บาท</span>
          </div>
        </div>

        {/* Cash Info */}
        {receipt.cashReceived && receipt.cashReceived > 0 && (
          <div style={{ marginTop: '10px', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
              <span style={{ minWidth: '120px', textAlign: 'right' }}>รับเงินมา</span>
              <span style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(receipt.cashReceived)} บาท</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '5px 0' }}>
              <span style={{ minWidth: '120px', textAlign: 'right' }}>เงินทอน</span>
              <span style={{ minWidth: '100px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{formatCurrency(receipt.changeAmount || 0)} บาท</span>
            </div>
          </div>
        )}

        {/* Notes */}
        {receipt.notes && (
          <div style={{ marginTop: '30px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ fontWeight: 'bold', color: '#1e40af' }}>หมายเหตุ</div>
            <div>{receipt.notes}</div>
          </div>
        )}

        {/* Footer - Signature boxes */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'center', paddingTop: '50px' }}>
            <div style={{ width: '150px', borderTop: '1px solid #333', margin: '0 auto 5px' }}></div>
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
    );
  }
);

POSReceiptA4.displayName = 'POSReceiptA4';
