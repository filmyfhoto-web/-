import { forwardRef, useRef, useImperativeHandle } from 'react';
import { POSReceipt } from '@/film-shop/types/pos';
import { ShopSettings } from '@/film-shop/types';
import { POSReceipt80mm } from '@/film-shop/components/pos/POSReceipt80mm';
import { POSReceiptA5 } from '@/film-shop/components/pos/POSReceiptA5';
import { POSReceiptA4 } from '@/film-shop/components/pos/POSReceiptA4';
import { PaperSize } from './PrintSettingsPanel';
import { PaperViewport } from '@/components/print/PaperViewport';
import type { PaperKey } from '@/lib/printScale';

interface UniversalReceiptPreviewProps {
  receipt: POSReceipt;
  settings: ShopSettings;
  paperSize: PaperSize;
  fontSize: number;
  showPriceColumn: boolean;
  showQtyColumn: boolean;
}

export interface UniversalReceiptPreviewRef {
  getElement: () => HTMLDivElement | null;
}

export const UniversalReceiptPreview = forwardRef<UniversalReceiptPreviewRef, UniversalReceiptPreviewProps>(
  ({ receipt, settings, paperSize, fontSize, showPriceColumn, showQtyColumn }, ref) => {
    const receiptRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getElement: () => receiptRef.current,
    }));

    const renderReceipt = () => {
      switch (paperSize) {
        case '80mm':
          return (
            <POSReceipt80mm
              ref={receiptRef}
              receipt={receipt}
              settings={settings}
              fontSize={fontSize}
              showPriceColumn={showPriceColumn}
              showQtyColumn={showQtyColumn}
            />
          );
        case '100x70':
          // 10×7 cm slip — reuse 80mm layout but widen container to 100mm
          // so the same compact template fits the wider receipt paper.
          return (
            <div style={{ width: '100mm' }} ref={receiptRef}>
              <POSReceipt80mm
                receipt={receipt}
                settings={settings}
                fontSize={fontSize}
                showPriceColumn={showPriceColumn}
                showQtyColumn={showQtyColumn}
              />
            </div>
          );
        case '100x75':
          // 10×7.5 cm slip (Gprinter GP-1324D) — same compact template
          // widened to 100mm; height handled by @page rule at print time.
          return (
            <div style={{ width: '100mm' }} ref={receiptRef}>
              <POSReceipt80mm
                receipt={receipt}
                settings={settings}
                fontSize={fontSize}
                showPriceColumn={showPriceColumn}
                showQtyColumn={showQtyColumn}
              />
            </div>
          );
        case 'A5':
          return (
            <POSReceiptA5
              ref={receiptRef}
              receipt={receipt}
              settings={settings}
              fontSize={fontSize}
              showPriceColumn={showPriceColumn}
              showQtyColumn={showQtyColumn}
            />
          );
        case 'A4':
          return (
            <POSReceiptA4
              ref={receiptRef}
              receipt={receipt}
              settings={settings}
              fontSize={fontSize}
              showPriceColumn={showPriceColumn}
              showQtyColumn={showQtyColumn}
            />
          );
        default:
          return null;
      }
    };

    // 100x70 / 100x75 slips reuse the 80mm template widened to 100mm, so
    // they share the same viewport key ("100x70"/"100x75" both map to real
    // mm sizes in PAPER_SIZES).
    const viewportPaper: PaperKey = paperSize;

    return (
      <div className="bg-gray-100 p-4 rounded-lg">
        <PaperViewport paper={viewportPaper} className="shadow-lg">
          {renderReceipt()}
        </PaperViewport>
      </div>
    );
  }
);

UniversalReceiptPreview.displayName = 'UniversalReceiptPreview';
