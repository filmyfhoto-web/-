import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DocumentPrintPreview } from '@/film-shop/components/print/DocumentPrintPreview';
import { PaperViewport } from '@/components/print/PaperViewport';
import { PAPER_SIZES, PaperKey, SHARED_PRINT_CSS } from '@/lib/printScale';

const PAPER_KEYS = Object.keys(PAPER_SIZES) as PaperKey[];

/**
 * Dev-only fixture for the *shared* PaperViewport (no DB, no auth):
 * `/dev/print-harness?fixture=paper&paper=A4&long=1`
 * Renders with PaperViewport defaults on purpose — QA asserts that a default
 * `<PaperViewport paper="A4">` fits a 390px viewport without extra props.
 */
function PaperFixture() {
  const [params, setParams] = useSearchParams();
  const paper = (params.get('paper') as PaperKey) || 'A4';
  const active: PaperKey = PAPER_SIZES[paper] ? paper : 'A4';
  const long = params.get('long') === '1';
  const rows = long ? 120 : 6;

  return (
    <div className="p-4" data-testid="paper-fixture" data-paper={active} data-long={long ? '1' : '0'}>
      <style>{SHARED_PRINT_CSS}</style>
      <div className="flex flex-wrap gap-2 pb-3 no-print">
        {PAPER_KEYS.map((key) => (
          <button
            key={key}
            data-testid={`pick-${key}`}
            onClick={() => setParams({ fixture: 'paper', paper: key, long: long ? '1' : '0' })}
            className="rounded border px-2 py-1 text-sm"
          >
            {key}
          </button>
        ))}
        <button
          data-testid="toggle-long"
          onClick={() => setParams({ fixture: 'paper', paper: active, long: long ? '0' : '1' })}
          className="rounded border px-2 py-1 text-sm"
        >
          long
        </button>
      </div>
      <div data-testid="preview-container" className="mx-auto w-full max-w-[900px] border">
        <PaperViewport paper={active}>
          <div data-testid="sheet-content" className="p-6">
            <h1 className="text-xl font-bold">เอกสารตัวอย่าง {active}</h1>
            <table className="w-full">
              <tbody>
                {Array.from({ length: rows }, (_, i) => (
                  <tr key={i}>
                    <td>รายการที่ {i + 1}</td>
                    <td>1</td>
                    <td>100.00</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div data-testid="doc-end">จบเอกสาร</div>
          </div>
        </PaperViewport>
      </div>
    </div>
  );
}

/**
 * Dev/QA harness that renders DocumentPrintPreview with a dummy body so
 * Playwright can drive the print settings UI (10×7 cm) without seeding an
 * authenticated Film Shop document.
 */
export default function PrintPreviewHarness() {
  const [closed, setClosed] = useState(false);
  const [params] = useSearchParams();
  if (params.get('fixture') === 'paper') return <PaperFixture />;
  if (closed) return <div>closed</div>;
  return (
    <div className="p-4">
      <DocumentPrintPreview
        title="ใบเสร็จตัวอย่าง"
        documentNumber="TEST-0001"
        initialPaperSize="100x70"
        onClose={() => setClosed(true)}
      >
        <div className="header">
          <div className="shop-name">ร้านตัวอย่าง</div>
          <div className="shop-info">สำหรับ QA พรีวิวก่อนพิมพ์</div>
        </div>
        <div className="doc-title">ใบเสร็จรับเงิน</div>
        <table>
          <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา</th></tr></thead>
          <tbody>
            <tr><td>สินค้า A</td><td>1</td><td>100.00</td></tr>
            <tr><td>สินค้า B</td><td>2</td><td>200.00</td></tr>
          </tbody>
        </table>
        <div className="summary">
          <div className="summary-row total-row">
            <span className="summary-label">รวม</span>
            <span className="summary-value">300.00</span>
          </div>
        </div>
      </DocumentPrintPreview>
    </div>
  );
}