/**
 * Deterministic fixtures for document E2E tests.
 *
 * Why hermetic: the real save flow depends on Supabase auth + RPC. To keep
 * companion-print regression tests stable across CI runs we synthesize the
 * printable DOM directly instead of driving the live save. The structure we
 * emit matches what `DocumentForm` actually renders into `printableRef` for
 * the "issue companion receipt" feature:
 *
 *   <div id="printable-area">
 *     <div id="doc-print" data-kind="invoice">…</div>
 *     <div class="rds-companion-doc" style="break-before:page;…">
 *       <div id="doc-print" data-kind="receipt">…</div>
 *     </div>
 *   </div>
 */

export type DocFixture = {
  docNo: string;
  companionDocNo: string | null;
  itemsCount: number;
};

export const SINGLE_DOC: DocFixture = {
  docNo: "INV-2025-0001",
  companionDocNo: null,
  itemsCount: 5,
};

export const DOC_WITH_COMPANION: DocFixture = {
  docNo: "INV-2025-0002",
  companionDocNo: "REC-2025-0002",
  itemsCount: 5,
};

export const MULTIPAGE_DOC_WITH_COMPANION: DocFixture = {
  docNo: "INV-2025-0003",
  companionDocNo: "REC-2025-0003",
  itemsCount: 40,
};

import { FIXED_DELIVERY_NO, FIXED_RECEIPT_NO } from "./companionDocNumbers";

/** Delivery note + receipt companion with deterministic doc numbers. */
export const DELIVERY_WITH_RECEIPT_COMPANION: DocFixture = {
  docNo: FIXED_DELIVERY_NO,
  companionDocNo: FIXED_RECEIPT_NO,
  itemsCount: 3,
};

/** Many-row delivery + receipt — exercises multi-page page-break ordering. */
export const DELIVERY_WITH_RECEIPT_MULTIPAGE: DocFixture = {
  docNo: FIXED_DELIVERY_NO,
  companionDocNo: FIXED_RECEIPT_NO,
  itemsCount: 40,
};

/** Stable date / uuid stubs so snapshots don't drift. */
export const DETERMINISTIC_INIT = `
  const FIXED = new Date("2025-01-15T03:00:00.000Z").getTime();
  const OrigDate = Date;
  // @ts-ignore
  Date = class extends OrigDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED); else super(...args);
    }
    static now() { return FIXED; }
  };
  let __c = 0;
  if (window.crypto) {
    window.crypto.randomUUID = () => {
      __c += 1;
      return "00000000-0000-4000-8000-" + String(__c).padStart(12, "0");
    };
  }
`;

/** Render an item row HTML string. */
function row(i: number): string {
  return `<tr><td>${i + 1}</td><td>สินค้า ${i + 1}</td><td>1</td><td>ชิ้น</td><td>100.00</td><td>100.00</td></tr>`;
}

/** Render a single #doc-print block. */
export function renderDocBlock(opts: {
  kind: "invoice" | "receipt";
  docNo: string;
  itemsCount: number;
}): string {
  const heading = opts.kind === "receipt" ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";
  const rows = Array.from({ length: opts.itemsCount }, (_, i) => row(i)).join("");
  const wrapStyle = opts.kind === "receipt"
    ? ' style="break-before:page;page-break-before:always"'
    : "";
  const wrapClass = opts.kind === "receipt" ? "rds-companion-doc" : "";
  const inner = `
    <div id="doc-print" data-kind="${opts.kind}">
      <header class="doc-header-group">
        <h1>${heading}</h1>
        <div class="doc-no">เลขที่: <span class="docno">${opts.docNo}</span></div>
        <div class="doc-date">วันที่: 15 ม.ค. 2568</div>
      </header>
      <table>
        <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ราคา</th><th>รวม</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <footer class="doc-footer">
        <div class="total">รวมสุทธิ: ${(opts.itemsCount * 100).toFixed(2)} บาท</div>
      </footer>
    </div>`;
  return opts.kind === "receipt"
    ? `<div class="${wrapClass}"${wrapStyle}>${inner}</div>`
    : inner;
}

/** Compose the full `#printable-area` markup matching DocumentForm output. */
export function renderPrintableArea(fx: DocFixture): string {
  const main = renderDocBlock({ kind: "invoice", docNo: fx.docNo, itemsCount: fx.itemsCount });
  const companion = fx.companionDocNo
    ? renderDocBlock({ kind: "receipt", docNo: fx.companionDocNo, itemsCount: fx.itemsCount })
    : "";
  return `<div id="printable-area" ref="printableRef">${main}${companion}</div>`;
}

/** Full test page HTML — sets up mocked window.print and a "พิมพ์" button. */
export function renderTestPage(fx: DocFixture): string {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>Companion Print Test — ${fx.docNo}</title>
  <style>
    body { font-family: sans-serif; margin: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 12px; }
    .doc-header-group { margin-bottom: 8px; }
    .rds-print-break { display: block; height: 0; }
    @media print {
      .rds-print-break { break-before: page; page-break-before: always; }
      .rds-companion-doc { break-before: page; page-break-before: always; }
    }
  </style>
</head>
<body>
  <button id="print-btn">พิมพ์</button>
  ${renderPrintableArea(fx)}
  <pre id="print-log"></pre>
  <script>
    window.__printCount = 0;
    const _origPrint = window.print;
    window.print = function () {
      window.__printCount = (window.__printCount || 0) + 1;
      const log = document.getElementById("print-log");
      if (log) log.textContent = "printed:" + window.__printCount;
      window.dispatchEvent(new Event("beforeprint"));
      window.dispatchEvent(new Event("afterprint"));
    };
    document.getElementById("print-btn").addEventListener("click", function () {
      // Mirror DocumentForm.triggerPrintWithFallback: gather all #doc-print
      // blocks under printableRef and combine with page-break separators.
      const area = document.getElementById("printable-area");
      const blocks = Array.from(area.querySelectorAll('[id="doc-print"]'));
      window.__combinedBlocks = blocks.length;
      window.print();
    });
  </script>
</body>
</html>`;
}

/**
 * Page that simulates the DocumentForm "ออกใบส่งของ + ใบเสร็จ" UX:
 *   - Starts with no printable blocks rendered.
 *   - "ออกใบส่งของ + ใบเสร็จ" button renders BOTH blocks and locks numbers.
 *   - "พิมพ์" reuses the locked numbers (never re-assigns).
 *   - A scope <select> mirrors `printScope` (main | companion | both) so the
 *     filter behaviour can be regression-tested without driving Supabase.
 *
 * `window.__issuedDocNos` is populated on first issue and MUST remain stable
 * across re-prints — this is the contract enforced by the reprint spec.
 */
export function renderIssueAndReprintPage(fx: DocFixture): string {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>Issue + Reprint — ${fx.docNo}</title>
  <style>
    body { font-family: sans-serif; margin: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; font-size: 12px; }
    .rds-companion-doc { break-before: page; page-break-before: always; }
  </style>
</head>
<body>
  <button id="issue-btn" data-testid="issue-delivery-and-receipt">ออกใบส่งของ + ใบเสร็จ</button>
  <button id="print-btn">พิมพ์</button>
  <label>ขอบเขตการพิมพ์
    <select id="scope">
      <option value="both" selected>ทั้งสองใบ</option>
      <option value="main">ใบส่งของอย่างเดียว</option>
      <option value="companion">ใบเสร็จอย่างเดียว</option>
    </select>
  </label>
  <div id="printable-area"></div>
  <pre id="print-log"></pre>
  <script>
    const FX = ${JSON.stringify({
      deliveryNo: fx.docNo,
      receiptNo: fx.companionDocNo,
      itemsCount: fx.itemsCount,
    })};
    window.__issuedDocNos = null;
    window.__printCount = 0;
    window.__lastPrintedDocNos = null;
    window.__lastCombinedHtml = "";
    window.__issueCount = 0;

    function row(i){ return '<tr><td>'+(i+1)+'</td><td>สินค้า '+(i+1)+'</td><td>1</td><td>ชิ้น</td><td>100.00</td><td>100.00</td></tr>'; }
    function block(kind, docNo, relatedNo){
      const heading = kind === 'receipt' ? 'ใบเสร็จรับเงิน' : 'ใบส่งของ';
      const rows = Array.from({length: FX.itemsCount}, (_, i) => row(i)).join('');
      const inner = '<div id="doc-print" data-kind="'+kind+'" data-doc-no="'+docNo+'" data-related-doc-no="'+(relatedNo||'')+'">'+
        '<header><h1>'+heading+'</h1><div>เลขที่: <span class="docno">'+docNo+'</span></div>'+
        '<div class="related">คู่กับ: <span class="related-no">'+(relatedNo||'')+'</span></div></header>'+
        '<table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ราคา</th><th>รวม</th></tr></thead>'+
        '<tbody>'+rows+'</tbody></table>'+
        '<footer>รวมสุทธิ: '+(FX.itemsCount*100).toFixed(2)+' บาท</footer></div>';
      return kind === 'receipt'
        ? '<div class="rds-companion-doc" style="break-before:page;page-break-before:always">'+inner+'</div>'
        : inner;
    }

    function issue(){
      window.__issueCount += 1;
      // Atomic: number assignment happens exactly once and is then frozen.
      if (!window.__issuedDocNos) {
        window.__issuedDocNos = { delivery: FX.deliveryNo, receipt: FX.receiptNo };
      }
      const { delivery, receipt } = window.__issuedDocNos;
      const area = document.getElementById('printable-area');
      area.innerHTML = block('delivery', delivery, receipt) + block('receipt', receipt, delivery);
    }

    function collectScoped(){
      const scope = document.getElementById('scope').value;
      const all = Array.from(document.querySelectorAll('#printable-area [id="doc-print"]'));
      if (all.length <= 1) return all;
      if (scope === 'main') return [all[0]];
      if (scope === 'companion') return [all[all.length - 1]];
      return all;
    }

    const _origPrint = window.print;
    window.print = function () {
      window.__printCount += 1;
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
    };

    document.getElementById('issue-btn').addEventListener('click', issue);
    document.getElementById('print-btn').addEventListener('click', function(){
      const blocks = collectScoped();
      window.__lastPrintedDocNos = blocks.map(b => b.getAttribute('data-doc-no'));
      window.__lastCombinedHtml = blocks.map((el, i) =>
        i === 0 ? el.outerHTML
               : '<div class="rds-print-break" style="break-before:page;page-break-before:always"></div>'+el.outerHTML
      ).join('');
      window.print();
    });
  </script>
</body>
</html>`;
}