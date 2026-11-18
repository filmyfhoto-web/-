// Standalone HTML/print template for the customer Purchase Order page.
// Does NOT go through the receipts document system — PO is not an official
// document, so it uses its own minimal A4 template.

import type { POItem } from "./parse";
import { lineTotal, poSubtotal } from "./parse";
import { openPrintWindowOrSurface } from "@/lib/printSurface";

export interface POExportInput {
  poNumber: string;
  dateThai: string;
  customer: { name: string; phone: string; org: string };
  seller: string;
  note: string;
  items: POItem[];
  requestQuotation: boolean;
  requestDelivery: boolean;
  store: { name: string; address: string; phones: string };
  logoUrl?: string;
}

const DISCLAIMER =
  "ใบสั่งสินค้าเป็นการประเมินราคา ไม่ใช่ใบส่งของ และไม่ใช่ใบเสนอราคา";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderPurchaseOrderHtml(input: POExportInput): string {
  const total = poSubtotal(input.items);
  const rows = input.items
    .filter((it) => it.name.trim())
    .map(
      (it, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(it.name)}</td>
          <td class="r">${it.quantity}</td>
          <td class="c">${esc(it.unit)}</td>
          <td class="r">${money(it.price)}</td>
          <td class="r">${money(lineTotal(it))}</td>
        </tr>`,
    )
    .join("");

  const flags: string[] = [];
  if (input.requestQuotation) flags.push("ลูกค้าขอใบเสนอราคา");
  if (input.requestDelivery) flags.push("ลูกค้าขอใบส่งของ");

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"/>
<title>ใบสั่งสินค้า ${esc(input.poNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Sarabun","Noto Sans Thai",sans-serif; color:#111; font-size:12pt; }
  .sheet { width: 186mm; margin: 0 auto; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:12mm; border-bottom:2px solid #be123c; padding-bottom:4mm; }
  .hdr .store { display:flex; gap:8mm; align-items:center; }
  .hdr img { width:22mm; height:22mm; object-fit:contain; }
  .hdr h1 { margin:0; color:#be123c; font-size:22pt; }
  .muted { color:#555; font-size:10pt; }
  .disc { margin:4mm 0; padding:3mm 4mm; background:#fff1f2; border:1px solid #fecdd3; border-radius:2mm; color:#9f1239; font-size:10.5pt; }
  .meta { display:grid; grid-template-columns: 1fr 1fr; gap:2mm 6mm; margin:3mm 0; font-size:11pt; }
  .meta div span.k { color:#666; margin-right:4pt; }
  .flags { margin:2mm 0; font-size:10.5pt; }
  .flags b { color:#be123c; }
  table.items { width:100%; border-collapse:collapse; margin-top:2mm; font-size:11pt; }
  table.items th, table.items td { border:1px solid #d4d4d8; padding:2mm 3mm; }
  table.items th { background:#fff1f2; color:#9f1239; }
  .c { text-align:center; }
  .r { text-align:right; }
  tfoot td { font-weight:600; background:#fafafa; }
  .foot { display:flex; justify-content:space-between; margin-top:8mm; font-size:10.5pt; color:#444; }
  .sig { border-top:1px dashed #999; padding-top:2mm; width:60mm; text-align:center; }
  @media print { .no-print { display:none !important; } }
</style></head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="store">
        ${input.logoUrl ? `<img src="${esc(input.logoUrl)}" alt=""/>` : ""}
        <div>
          <div style="font-weight:700; font-size:14pt;">${esc(input.store.name)}</div>
          <div class="muted">${esc(input.store.address)}</div>
          <div class="muted">${esc(input.store.phones)}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <h1>ใบสั่งสินค้า</h1>
        <div class="muted">Purchase Order (ประเมินราคา)</div>
        <div style="margin-top:2mm;"><span class="muted">เลขที่</span> <b>${esc(input.poNumber)}</b></div>
        <div><span class="muted">วันที่</span> ${esc(input.dateThai)}</div>
      </div>
    </div>

    <div class="disc"><b>คำชี้แจง</b> — ${DISCLAIMER}</div>

    <div class="meta">
      <div><span class="k">ลูกค้า:</span>${esc(input.customer.name || "-")}</div>
      <div><span class="k">เบอร์:</span>${esc(input.customer.phone || "-")}</div>
      <div><span class="k">โรงเรียน/หน่วยงาน:</span>${esc(input.customer.org || "-")}</div>
      <div><span class="k">ผู้จัดทำ:</span>${esc(input.seller || "-")}</div>
    </div>

    ${flags.length ? `<div class="flags"><b>คำขอเพิ่มเติม:</b> ${flags.map(esc).join(" · ")}</div>` : ""}

    <table class="items">
      <thead>
        <tr><th style="width:10mm">ลำดับ</th><th>รายการสินค้า</th><th style="width:18mm">จำนวน</th><th style="width:18mm">หน่วย</th><th style="width:22mm">ราคา</th><th style="width:26mm">ยอดรวม</th></tr>
      </thead>
      <tbody>${rows || `<tr><td class="c" colspan="6" style="color:#999">— ไม่มีรายการ —</td></tr>`}</tbody>
      <tfoot>
        <tr><td class="r" colspan="5">ยอดรวมประมาณการ (บาท)</td><td class="r">${money(total)}</td></tr>
      </tfoot>
    </table>

    ${input.note ? `<div style="margin-top:4mm; font-size:10.5pt;"><b>หมายเหตุ:</b> ${esc(input.note)}</div>` : ""}

    <div class="foot">
      <div class="muted">* ราคาทั้งหมดเป็นการประเมิน แอดมินจะยืนยันก่อนออกเอกสารจริง</div>
      <div class="sig">ลงชื่อผู้สั่งซื้อ</div>
    </div>
  </div>
</body></html>`;
}

/** Open the print/PDF window with the rendered PO. */
export function openPrintWindow(html: string): void {
  const w = openPrintWindowOrSurface("width=900,height=1200");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch { /* ignore */ }
  };
  // Give the browser a tick to lay out fonts/images before printing.
  setTimeout(trigger, 350);
}

/** Download the PO HTML as a standalone .html file. */
export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}