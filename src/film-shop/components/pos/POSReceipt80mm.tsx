import { forwardRef } from 'react';
import { POSReceipt, PAYMENT_STATUS_LABELS, CopyType } from '@/film-shop/types/pos';
import { ShopSettings } from '@/film-shop/types';

interface POSReceipt80mmProps {
  receipt: POSReceipt;
  settings: ShopSettings;
  fontSize?: number;
  showPriceColumn?: boolean;
  showQtyColumn?: boolean;
  showDimensionColumn?: boolean;
  copyType?: CopyType;
}

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const numberToThaiText = (num: number): string => {
  const units = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  
  if (num === 0) return 'ศูนย์บาทถ้วน';
  
  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  
  let result = '';
  let tempNum = intPart;
  let position = 0;
  
  while (tempNum > 0) {
    const digit = tempNum % 10;
    if (digit !== 0) {
      if (position === 1 && digit === 1) {
        result = 'สิบ' + result;
      } else if (position === 1 && digit === 2) {
        result = 'ยี่สิบ' + result;
      } else if (position === 0 && digit === 1 && intPart > 10) {
        result = 'เอ็ด' + result;
      } else {
        result = units[digit] + positions[position] + result;
      }
    }
    tempNum = Math.floor(tempNum / 10);
    position++;
  }
  
  result += 'บาท';
  
  if (decPart === 0) {
    result += 'ถ้วน';
  } else {
    let decResult = '';
    let tempDec = decPart;
    let decPosition = 0;
    
    while (tempDec > 0) {
      const digit = tempDec % 10;
      if (digit !== 0) {
        if (decPosition === 1 && digit === 1) {
          decResult = 'สิบ' + decResult;
        } else if (decPosition === 1 && digit === 2) {
          decResult = 'ยี่สิบ' + decResult;
        } else if (decPosition === 0 && digit === 1 && decPart > 10) {
          decResult = 'เอ็ด' + decResult;
        } else {
          decResult = units[digit] + positions[decPosition] + decResult;
        }
      }
      tempDec = Math.floor(tempDec / 10);
      decPosition++;
    }
    result += decResult + 'สตางค์';
  }
  
  return result;
};

export const POSReceipt80mm = forwardRef<HTMLDivElement, POSReceipt80mmProps>(
  ({ receipt, settings, fontSize = 100, showPriceColumn = true, showQtyColumn = true, showDimensionColumn = true, copyType }, ref) => {
    const hasItemsWithDimensions = receipt.items.some(item => item.width && item.height);
    const baseFontSize = 14 * (fontSize / 100);
    const paymentStatusLabel = PAYMENT_STATUS_LABELS[receipt.paymentStatus] || 'ยังไม่จ่าย';
    return (
      <div
        ref={ref}
        style={{ 
          width: '72mm', 
          maxWidth: '72mm',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: '"Sarabun", Tahoma, Arial, sans-serif',
          fontSize: `${baseFontSize}px`,
          fontWeight: 400,
          lineHeight: '1.25',
          padding: '2mm 1mm',
          boxSizing: 'border-box',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          margin: '0 auto',
        }}
      >
        {/* Copy Type Header */}
        {copyType && (
          <div style={{ 
            textAlign: 'center', 
            marginBottom: '4px',
            padding: '2px',
            backgroundColor: copyType === 'customer' ? '#e3f2fd' : '#fff3e0',
            border: '1px solid #000',
            fontWeight: 'bold',
            fontSize: `${baseFontSize * 0.85}px`
          }}>
            {copyType === 'customer' ? '📋 สำเนาลูกค้า' : '📋 สำเนาร้าน'}
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
          <h1 style={{ 
            fontSize: `${baseFontSize * 1.15}px`, 
            fontWeight: 'bold', 
            color: '#000000', 
            margin: '0 0 1px 0',
          }}>
            {settings.shopName}
          </h1>
          <p style={{ fontSize: `${baseFontSize * 0.8}px`, margin: '0', color: '#000000' }}>{settings.shopAddress}</p>
          {settings.shopPhone && (
            <p style={{ fontSize: `${baseFontSize * 0.8}px`, margin: '0', color: '#000000' }}>โทร: {settings.shopPhone}</p>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px dashed #000000', margin: '3px 0' }}></div>

        {/* Receipt Info */}
        <div style={{ marginBottom: '4px', fontSize: `${baseFontSize * 0.85}px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>เลขที่:</span>
            <span>{receipt.receiptNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>ลูกค้า:</span>
            <span>{receipt.customerName || '-'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>วันที่:</span>
            <span>{formatDate(receipt.receiptDate)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 'bold' }}>การจ่าย:</span>
            <span>{receipt.paymentType === 'cash' ? 'เงินสด' : receipt.paymentType === 'transfer' ? 'เงินโอน' : 'ลงบัญชี'}</span>
          </div>
        </div>

        {/* Items Table */}
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          border: '1px solid #000000',
          fontSize: `${baseFontSize * 0.8}px`
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ 
                padding: '3px 2px', 
                textAlign: 'center', 
                fontWeight: 'bold',
                color: '#000000',
                borderBottom: '1px solid #000000',
                borderRight: '1px solid #000000',
                width: '20px'
              }}>#</th>
              <th style={{ 
                padding: '3px 2px', 
                textAlign: 'left', 
                fontWeight: 'bold',
                color: '#000000',
                borderBottom: '1px solid #000000',
                borderRight: '1px solid #000000'
              }}>รายการ</th>
              {showDimensionColumn && hasItemsWithDimensions && (
                <th style={{ 
                  padding: '3px 2px', 
                  textAlign: 'center', 
                  fontWeight: 'bold',
                  color: '#000000',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  width: '40px'
                }}>ขนาด</th>
              )}
              {showQtyColumn && (
                <th style={{ 
                  padding: '3px 2px', 
                  textAlign: 'center', 
                  fontWeight: 'bold',
                  color: '#000000',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  width: '28px'
                }}>จน.</th>
              )}
              {showPriceColumn && (
                <th style={{ 
                  padding: '3px 2px', 
                  textAlign: 'right', 
                  fontWeight: 'bold',
                  color: '#000000',
                  borderBottom: '1px solid #000000',
                  borderRight: '1px solid #000000',
                  width: '45px'
                }}>ราคา</th>
              )}
              <th style={{ 
                padding: '3px 2px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                color: '#000000',
                borderBottom: '1px solid #000000',
                width: '50px'
              }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={item.id}>
                <td style={{ 
                  padding: '2px', 
                  textAlign: 'center', 
                  color: '#000000',
                  borderBottom: '1px solid #ccc',
                  borderRight: '1px solid #000000'
                }}>{index + 1}</td>
                <td style={{ 
                  padding: '2px', 
                  color: '#000000',
                  borderBottom: '1px solid #ccc',
                  borderRight: '1px solid #000000',
                  wordBreak: 'break-word'
                }}>{item.name}{showQtyColumn && item.unit ? ` (${item.unit})` : ''}</td>
                {showDimensionColumn && hasItemsWithDimensions && (
                  <td style={{ 
                    padding: '2px', 
                    textAlign: 'center', 
                    color: '#000000',
                    borderBottom: '1px solid #ccc',
                    borderRight: '1px solid #000000',
                    fontSize: '0.85em'
                  }}>{item.width && item.height ? `${item.width}x${item.height}` : '-'}</td>
                )}
                {showQtyColumn && (
                  <td style={{ 
                    padding: '2px', 
                    textAlign: 'center', 
                    color: '#000000',
                    borderBottom: '1px solid #ccc',
                    borderRight: '1px solid #000000'
                  }}>{item.quantity}</td>
                )}
                {showPriceColumn && (
                  <td style={{ 
                    padding: '2px', 
                    textAlign: 'right', 
                    color: '#000000',
                    borderBottom: '1px solid #ccc',
                    borderRight: '1px solid #000000'
                  }}>{formatCurrency(item.price)}</td>
                )}
                <td style={{ 
                  padding: '2px', 
                  textAlign: 'right', 
                  fontWeight: 'bold',
                  color: '#000000',
                  borderBottom: '1px solid #ccc'
                }}>{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total Section */}
        <div style={{ 
          borderTop: '1px dashed #000000', 
          marginTop: '6px', 
          paddingTop: '6px' 
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontWeight: 'bold', 
            fontSize: `${baseFontSize * 1.1}px`,
            color: '#000000'
          }}>
            <span>รวมทั้งสิ้น:</span>
            <span>{formatCurrency(receipt.total)} บาท</span>
          </div>
          <div style={{ 
            fontSize: `${baseFontSize * 0.8}px`, 
            color: '#000000', 
            marginTop: '2px',
            fontStyle: 'italic'
          }}>
            ({numberToThaiText(receipt.total)})
          </div>
        </div>

        {/* Cash Info Section - รับมา/ทอน */}
        {receipt.cashReceived && receipt.cashReceived > 0 && (
          <div style={{ 
            margin: '8px 0',
            padding: '6px',
            border: '1px solid #000000',
            backgroundColor: '#f5f5f5',
            fontSize: `${baseFontSize * 0.9}px`
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>💵 การชำระเงิน</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>รับเงินมา:</span>
              <span style={{ fontWeight: 'bold' }}>฿{formatCurrency(receipt.cashReceived)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>เงินทอน:</span>
              <span style={{ fontWeight: 'bold', color: receipt.changeAmount && receipt.changeAmount > 0 ? '#16a34a' : '#000000' }}>
                ฿{formatCurrency(receipt.changeAmount || 0)}
              </span>
            </div>
          </div>
        )}

        {/* Payment Status Checkboxes */}
        <div style={{ 
          margin: '8px 0',
          padding: '6px',
          border: '1px solid #000000',
          fontSize: `${baseFontSize * 0.85}px`
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>สถานะการชำระเงิน:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ 
                display: 'inline-block', 
                width: '12px', 
                height: '12px', 
                border: '1px solid #000',
                backgroundColor: receipt.paymentStatus === 'pending' ? '#000' : 'transparent',
                color: receipt.paymentStatus === 'pending' ? '#fff' : 'transparent',
                textAlign: 'center',
                lineHeight: '10px',
                fontSize: '10px'
              }}>{receipt.paymentStatus === 'pending' ? '✓' : ''}</span>
              ยังไม่จ่าย
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ 
                display: 'inline-block', 
                width: '12px', 
                height: '12px', 
                border: '1px solid #000',
                backgroundColor: receipt.paymentStatus === 'deposit' ? '#000' : 'transparent',
                color: receipt.paymentStatus === 'deposit' ? '#fff' : 'transparent',
                textAlign: 'center',
                lineHeight: '10px',
                fontSize: '10px'
              }}>{receipt.paymentStatus === 'deposit' ? '✓' : ''}</span>
              มัดจำ {receipt.deposit > 0 ? `${receipt.deposit}฿` : '......'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ 
                display: 'inline-block', 
                width: '12px', 
                height: '12px', 
                border: '1px solid #000',
                backgroundColor: receipt.paymentStatus === 'paid' ? '#000' : 'transparent',
                color: receipt.paymentStatus === 'paid' ? '#fff' : 'transparent',
                textAlign: 'center',
                lineHeight: '10px',
                fontSize: '10px'
              }}>{receipt.paymentStatus === 'paid' ? '✓' : ''}</span>
              จ่ายแล้ว
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ 
                display: 'inline-block', 
                width: '12px', 
                height: '12px', 
                border: '1px solid #000',
                backgroundColor: receipt.paymentStatus === 'credit' ? '#000' : 'transparent',
                color: receipt.paymentStatus === 'credit' ? '#fff' : 'transparent',
                textAlign: 'center',
                lineHeight: '10px',
                fontSize: '10px'
              }}>{receipt.paymentStatus === 'credit' ? '✓' : ''}</span>
              ลงบัญชี
            </span>
          </div>
        </div>

        {/* Signature */}
        <div style={{ 
          textAlign: 'center', 
          margin: '8px 0', 
          fontSize: `${baseFontSize * 0.9}px`,
          color: '#000000'
        }}>
          ลงชื่อ.......................ผู้รับเงิน
        </div>

        {/* Footer */}
        <div style={{ 
          textAlign: 'center', 
          fontSize: `${baseFontSize * 0.85}px`, 
          marginTop: '6px',
          color: '#000000'
        }}>
          <p style={{ margin: '0', fontWeight: 'bold' }}>โอนพร้อมเพย์ {settings.shopPhone}</p>
          <p style={{ margin: '2px 0', fontWeight: 'bold' }}>ขอบคุณที่ใช้บริการ</p>
        </div>

        {/* Service Info Box */}
        <div style={{ 
          marginTop: '8px', 
          padding: '6px', 
          border: '1px solid #000000',
          backgroundColor: '#ffffff',
          fontSize: `${baseFontSize * 0.75}px`,
          lineHeight: '1.3',
          color: '#000000'
        }}>
          <p style={{ margin: '0', fontWeight: 'bold' }}>
            บริการ: รับทำสิ่งพิมพ์ทุกชนิด, สกรีน, สติ๊กเกอร์ไดคัท, ป้าย
          </p>
          <p style={{ margin: '2px 0 0', fontWeight: 'bold' }}>
            จำหน่าย: เสื้อผ้า, ชุดนักเรียน, กีฬา, ของชำร่วย
          </p>
        </div>
      </div>
    );
  }
);

POSReceipt80mm.displayName = 'POSReceipt80mm';
