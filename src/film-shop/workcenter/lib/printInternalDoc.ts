import {
  ESTIMATE_NOTICE, INTERNAL_DOC_NOTICE, categoryLabel, deptLabel, formatThaiDate, formatThb,
} from '@/film-shop/workcenter/lib/workcenter';
import { printWhenFontsReady } from '@/lib/printSurface';

export interface PrintRow {
  no: number;
  title: string;
  detail?: string;
  category?: string | null;
  dept?: string | null;
  size?: string | null;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number;
  costPrice?: number;
  amount?: number;
  note?: string | null;
}

export interface PrintDocInput {
  docTitle: string;
  docNo?: string | null;
  notice: string;
  meta: { label: string; value: string }[];
  columns: ('no' | 'title' | 'category' | 'dept' | 'size' | 'qty' | 'unitPrice' | 'cost' | 'amount' | 'note')[];
  rows: PrintRow[];
  summary?: { label: string; value: string }[];
  footerNote?: string;
  signatures?: string[];
}

const COL_LABEL: Record<string, string> = {
  no: 'ลำดับ', title: 'รายการ', category: 'หมวดงาน', dept: 'ฝ่ายผลิต', size: 'ขนาด',
  qty: 'จำนวน', unitPrice: 'ราคา/หน่วย', cost: 'ราคาทุน', amount: 'จำนวนเงิน', note: 'หมายเหตุ',
};

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

function cell(col: string, r: PrintRow): string {
  switch (col) {
    case 'no': return esc(r.no);
    case 'title': return `<strong>${esc(r.title)}</strong>${r.detail ? `<div class="sub">${esc(r.detail)}</div>` : ''}`;
    case 'category': return esc(categoryLabel(r.category));
    case 'dept': return esc(deptLabel(r.dept));
    case 'size': return esc(r.size || '-');
    case 'qty': return `${esc(r.quantity ?? '-')} ${esc(r.unit || '')}`;
    case 'unitPrice': return formatThb(r.unitPrice ?? 0);
    case 'cost': return formatThb(r.costPrice ?? 0);
    case 'amount': return formatThb(r.amount ?? 0);
    case 'note': return esc(r.note || '-');
    default: return '';
  }
}

/** สร้าง HTML เอกสารภายใน A4 ภาษาไทย (ใช้ทั้งพรีวิวและสั่งพิมพ์) */
export function buildInternalDocHtml(input: PrintDocInput): string {
  const head = input.columns.map((c) => `<th>${COL_LABEL[c]}</th>`).join('');
  const body = input.rows.map((r) => `<tr>${input.columns.map((c) => `<td class="c-${c}">${cell(c, r)}</td>`).join('')}</tr>`).join('');
  const meta = input.meta.map((m) => `<div><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join('');
  const summary = (input.summary ?? []).map((s) => `<div><span>${esc(s.label)}</span><b>${esc(s.value)}</b></div>`).join('');
  const signs = (input.signatures ?? []).map((s) => `<div class="sign"><div class="line"></div>${esc(s)}</div>`).join('');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>${esc(input.docTitle)}</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: "Sarabun","Noto Sans Thai","TH Sarabun New",sans-serif; color:#111; font-size:13px; margin:0; }
h1 { font-size:20px; margin:0 0 2px; }
.notice { display:inline-block; border:1px solid #b91c1c; color:#b91c1c; padding:2px 8px; border-radius:6px; font-size:11px; margin-bottom:10px; }
.meta { display:grid; grid-template-columns:repeat(2,1fr); gap:2px 16px; margin-bottom:10px; }
.meta div { display:flex; gap:6px; }
.meta span { color:#555; min-width:82px; }
table { width:100%; border-collapse:collapse; }
th,td { border:1px solid #999; padding:5px 6px; vertical-align:top; }
th { background:#f1f5f9; font-weight:600; text-align:left; }
.sub { color:#555; font-size:11px; font-weight:400; }
.c-no,.c-qty { text-align:center; white-space:nowrap; }
.c-unitPrice,.c-cost,.c-amount { text-align:right; white-space:nowrap; }
.summary { margin-top:10px; margin-left:auto; width:52%; }
.summary div { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px dashed #ccc; }
.foot { margin-top:12px; font-size:11px; color:#444; white-space:pre-wrap; }
.signs { display:flex; gap:24px; margin-top:26px; }
.sign { flex:1; text-align:center; font-size:11px; }
.sign .line { border-top:1px solid #666; margin-bottom:4px; height:28px; }
@media print { .no-print { display:none !important; } }
</style></head><body>
<h1>${esc(input.docTitle)}${input.docNo ? ` <small>เลขที่ ${esc(input.docNo)}</small>` : ''}</h1>
<div class="notice">${esc(input.notice)}</div>
<div class="meta">${meta}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${input.columns.length}">ไม่มีรายการ</td></tr>`}</tbody></table>
${summary ? `<div class="summary">${summary}</div>` : ''}
${input.footerNote ? `<div class="foot">${esc(input.footerNote)}</div>` : ''}
${signs ? `<div class="signs">${signs}</div>` : ''}
</body></html>`;
}

/** พิมพ์เอกสารผ่าน iframe ซ่อน — ไม่รบกวนหน้าเดิมและไม่โดน popup blocker */
export function printInternalDoc(input: PrintDocInput) {
  const html = buildInternalDocHtml(input);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) { document.body.removeChild(frame); return; }
  doc.open(); doc.write(html); doc.close();
  const run = () => {
    // รอฟอนต์ไทยพร้อมก่อนพิมพ์ (helper กลางเดียวกับจุดพิมพ์อื่น)
    void printWhenFontsReady(frame.contentWindow).then(() => {
      window.setTimeout(() => { frame.remove(); }, 1500);
    });
  };
  if (frame.contentWindow?.document.readyState === 'complete') run();
  else frame.onload = run;
}

export const DOC_NOTICES = { internal: INTERNAL_DOC_NOTICE, estimate: ESTIMATE_NOTICE };
export { formatThaiDate, formatThb };