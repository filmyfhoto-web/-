import type { DailyReportSnapshot } from '@/film-shop/hooks/useDailyReport';
import { openPrintWindowOrSurface } from "@/lib/printSurface";

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const escapeHtml = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const STATUS_LABELS: Record<string, string> = {
  pending: 'ยังไม่จ่าย', deposit: 'มัดจำ', paid: 'จ่ายแล้ว', credit: 'ลงบัญชี',
};

const ADV_STATUS: Record<string, string> = {
  open: 'ค้างชำระ', partial: 'คืนบางส่วน', settled: 'ปิดยอด', cancelled: 'ยกเลิก',
};

const TYPE_LABEL: Record<string, string> = {
  quotation: 'ใบเสนอราคา', invoice: 'ใบวางบิล', receipt: 'ใบเสร็จ',
};

function formatThaiDateFull(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatThaiDateTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('th-TH-u-ca-buddhist', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Renders the daily report into a new window and triggers print.
 * Sections (per requirements):
 *   1) สรุปยอดเงินสดหน้าร้าน (POS cash, paid only)
 *   2) สรุปยอดเงินโอน (invoices paid via transfer + any POS transfer)
 *   3) ยอดขายตามสถานะบิล (POS + invoices รวม — กี่ใบ ราคาเท่าไหร่)
 *   4) รายรับ/รายจ่าย
 *   5) การเบิกกระดาษ — แสดงเสมอ
 *   6) การเบิกเงิน — แสดงเสมอ
 */
export function printDailyReport(opts: {
  date: string;
  shopName: string;
  snapshot: DailyReportSnapshot;
  notes?: string;
  closedAt?: string | null;
  isDraft?: boolean;
  /** Override snapshot.sales.byCategory (e.g. when user filters POS by status). */
  byCategoryOverride?: DailyReportSnapshot['sales']['byCategory'];
  /** Label shown after the category section title when override is used. */
  categoryFilterLabel?: string;
}) {
  const { date, shopName, snapshot, notes, closedAt, isDraft = false, byCategoryOverride, categoryFilterLabel } = opts;

  // ===== 1) Cash storefront summary (POS cash, paid only) =====
  const posCashPaid = snapshot.sales.receipts.filter(
    r => (r.paymentType || 'cash') === 'cash' && r.status === 'paid'
  );
  const cashCount = posCashPaid.length;
  const cashTotal = posCashPaid.reduce((s, r) => s + (r.total || 0), 0);

  // ===== 2) Transfer summary — นิยามเดียวกันทุกหน้า: นับเฉพาะรายการที่รับเงินแล้ว (paid/deposit)
  // จากใบกำกับ payment_method='transfer' + POS payment_type='transfer' (ถ้ามีในอนาคต)
  const invTransfer = snapshot.invoices.byPaymentMethod?.transfer || { count: 0, total: 0 };
  const posTransfer = snapshot.sales.receipts.filter(
    r => (r.paymentType as string) === 'transfer' && (r.status === 'paid' || r.status === 'deposit')
  );
  const transferCount = invTransfer.count + posTransfer.length;
  const transferTotal = invTransfer.total + posTransfer.reduce((s, r) => s + (r.total || 0), 0);

  // ===== 3) Combined sales by status (POS + invoices) =====
  type StatusAgg = { count: number; total: number };
  const combinedByStatus: Record<string, StatusAgg> = {
    pending: { count: 0, total: 0 },
    deposit: { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
  };
  (['pending','deposit','paid','credit'] as const).forEach(s => {
    const a = snapshot.sales.byStatus[s] || { count: 0, total: 0 };
    const b = snapshot.invoices.byStatus[s] || { count: 0, total: 0 };
    combinedByStatus[s] = { count: a.count + b.count, total: a.total + b.total };
  });
  const totalBillCount = snapshot.sales.count + snapshot.invoices.count;
  const totalBillAmount = snapshot.sales.total + snapshot.invoices.total;

  // ===== 4) Income/expense rows =====
  const expenseRows = snapshot.expenses.items.length
    ? snapshot.expenses.items.map(t => `<tr><td>${t.type === 'expense' ? 'รายจ่าย' : 'รายรับ'}</td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(t.description || '-')}</td><td class="right">${fmt(t.amount)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">ไม่มีรายการ</td></tr>`;

  // ===== 5) Paper withdrawals — always show =====
  const paperItems = snapshot.paperWithdrawals?.items || [];
  const paperRows = paperItems.length
    ? paperItems.map(p => `<tr>
        <td>${new Date(p.withdrawnAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>${escapeHtml(p.paperType)}</td>
        <td class="right">${fmt(p.quantity)}</td>
        <td>${escapeHtml(p.unit)}</td>
        <td>${escapeHtml(p.withdrawnBy)}</td>
        <td>${escapeHtml(p.purpose || '-')}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">ไม่มีการเบิกกระดาษวันนี้</td></tr>`;

  // ===== 6) Cash advances — always show =====
  const advItems = snapshot.cashAdvances?.items || [];
  const advRows = advItems.length
    ? advItems.map(a => `<tr><td>${escapeHtml(a.borrower)}</td><td>${escapeHtml(a.purpose)}</td><td>${ADV_STATUS[a.status] || escapeHtml(a.status)}</td><td class="right">${fmt(a.amount)}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">ไม่มีการเบิกเงินวันนี้</td></tr>`;

  // ===== POS sales by category (walk-in, no invoice/quotation) =====
  const byCategory = byCategoryOverride ?? snapshot.sales.byCategory ?? [];
  const categoryTotalAmount = byCategory.reduce((s, c) => s + c.total, 0);
  const categoryTotalItems = byCategory.reduce((s, c) => s + c.itemCount, 0);
  const categoryRows = byCategory.length
    ? byCategory.map(c => {
        const headerRow = `<tr class="cat-row">
          <td class="cat-name"><strong>${escapeHtml(c.category)}</strong></td>
          <td class="center num">${c.itemCount}</td>
          <td class="center num">${fmt(c.quantity)}</td>
          <td class="right num"><strong>${fmt(c.total)}</strong></td>
        </tr>`;
        const subRows = c.topItems.map((t, i) => {
          const unitPrice = t.total / Math.max(1, t.quantity);
          return `<tr class="sub-row">
            <td class="sub-name" colspan="2">↳ <span class="rank">Top ${i + 1}</span> ${escapeHtml(t.name)}</td>
            <td class="center num">${fmt(t.quantity)} × ${fmt(unitPrice)}</td>
            <td class="right num">${fmt(t.total)}</td>
          </tr>`;
        }).join('');
        return headerRow + subRows;
      }).join('')
    : `<tr><td colspan="4" class="empty">ไม่มีการขายหน้าร้านวันนี้</td></tr>`;

  // ===== Outstanding bills (all dates) — รายชื่อบิลที่ยังไม่ได้จ่าย =====
  const outstandingItems = snapshot.outstanding?.items || [];
  const outstandingCount = snapshot.outstanding?.count || 0;
  const outstandingTotalDue = snapshot.outstanding?.totalDue || 0;
  const outstandingRows = outstandingItems.length
    ? outstandingItems.map(o => {
        const d = new Date(o.documentDate);
        const dateLabel = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
        return `<tr>
          <td>${escapeHtml(o.number)}</td>
          <td>${escapeHtml(o.customer)}</td>
          <td>${TYPE_LABEL[o.type] || escapeHtml(o.type)}</td>
          <td class="center">${dateLabel}</td>
          <td class="center">${o.ageDays}</td>
          <td>${STATUS_LABELS[o.status] || escapeHtml(o.status)}</td>
          <td class="right">${fmt(o.total)}</td>
          <td class="right">${fmt(o.due)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8" class="empty">ไม่มีบิลค้างชำระ</td></tr>`;

  const styles = `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Sarabun','Noto Sans Thai','Tahoma',sans-serif; color: #111; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
    h1, h2, h3 { margin: 0; }
    .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
    .header h1 { font-size: 20px; color: #1e40af; font-weight: 700; }
    .header .shop { font-size: 14px; margin-top: 4px; font-weight: 600; }
    .header .meta { font-size: 11px; color: #555; margin-top: 4px; }
    .section { margin-top: 14px; page-break-inside: avoid; }
    .section h2 { font-size: 13px; color: #1e40af; border-left: 4px solid #1e40af; padding-left: 8px; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #d4d4d8; padding: 5px 7px; text-align: left; }
    th { background: #eff6ff; font-weight: 600; color: #1e3a8a; }
    .right { text-align: right; }
    .center { text-align: center; }
    .total-row td { font-weight: 700; background: #f9fafb; }
    .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
    .pay-card { border: 1px solid #d4d4d8; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .pay-card .label { font-size: 11px; color: #555; }
    .pay-card .value { font-size: 18px; font-weight: 700; margin-top: 4px; color: #1e3a8a; }
    .pay-card .sub { font-size: 11px; color: #666; margin-top: 2px; }
    .notes { margin-top: 10px; padding: 8px 10px; border: 1px dashed #999; border-radius: 6px; background: #fafafa; white-space: pre-wrap; font-size: 11px; }
    .footer { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; font-size: 11px; }
    .sig { border-top: 1px solid #333; padding-top: 4px; text-align: center; margin-top: 50px; }
    .empty { color: #888; font-style: italic; padding: 4px; text-align: center; }
    .draft-banner { background: #fef3c7; border: 2px dashed #b45309; color: #92400e; padding: 8px 12px; border-radius: 6px; text-align: center; font-weight: 700; margin-bottom: 12px; font-size: 13px; }
    .draft-watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); font-size: 110px; color: rgba(180,83,9,0.10); font-weight: 900; pointer-events: none; z-index: 0; letter-spacing: 8px; }
    .cat-row td { background: #f3f6fb; }
    .cat-row .cat-name { word-break: break-word; white-space: normal; }
    .sub-row td { background: #ffffff; font-size: 10px; color: #444; padding: 3px 7px; }
    .sub-row .sub-name { padding-left: 16px; word-break: break-word; white-space: normal; }
    .sub-row .rank { display: inline-block; background: #e0e7ff; color: #1e3a8a; font-size: 9px; padding: 1px 4px; border-radius: 3px; margin-right: 4px; }
    .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    @media print { .no-print { display: none !important; } }
  `;

  const salesByStatusRows = (['pending','deposit','paid','credit'] as const)
    .map(s => `<tr><td>${STATUS_LABELS[s]}</td><td class="center">${combinedByStatus[s].count}</td><td class="right">${fmt(combinedByStatus[s].total)}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" />
<title>รายงานประจำวัน ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${styles}</style>
</head><body>
  ${isDraft ? '<div class="draft-watermark">ฉบับร่าง</div>' : ''}
  <div class="header">
    <h1>รายงานสรุปประจำวัน</h1>
    <div class="shop">${escapeHtml(shopName)}</div>
    <div class="meta">วันที่ ${formatThaiDateFull(date)} ${closedAt ? `· ปิดงานเมื่อ ${formatThaiDateTime(closedAt)}` : ''}</div>
  </div>
  ${isDraft ? '<div class="draft-banner">⚠ ฉบับร่าง — ยังไม่ได้ปิดยอด/บันทึกรายงานประจำวันนี้</div>' : ''}

  <div class="section">
    <h2>สรุปยอดเงินรับ</h2>
    <div class="pay-grid">
      <div class="pay-card">
        <div class="label">💵 ยอดเงินสดหน้าร้าน (POS · จ่ายแล้ว)</div>
        <div class="value">${fmt(cashTotal)} บาท</div>
        <div class="sub">${cashCount} ใบ</div>
      </div>
      <div class="pay-card">
        <div class="label">🏦 ยอดเงินโอน (ใบกำกับ)</div>
        <div class="value">${fmt(transferTotal)} บาท</div>
        <div class="sub">${transferCount} ใบ</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>ยอดขายแยกตามสถานะบิล (รวม ${totalBillCount} ใบ · ${fmt(totalBillAmount)} บาท)</h2>
    <table>
      <thead><tr><th>สถานะ</th><th class="center">จำนวน (ใบ)</th><th class="right">ยอดรวม (บาท)</th></tr></thead>
      <tbody>
        ${salesByStatusRows}
        <tr class="total-row"><td>รวม</td><td class="center">${totalBillCount}</td><td class="right">${fmt(totalBillAmount)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>ขายหน้าร้าน (POS) — แยกตามประเภทสินค้า (${categoryTotalItems} รายการ · รวม ${fmt(categoryTotalAmount)} บาท)</h2>
    <div style="font-size:10px;color:#666;margin-bottom:4px;">ยอดขายผ่าน POS ที่ไม่ได้ออกใบกำกับ/ใบเสนอราคา${categoryFilterLabel ? ` — กรอง: <strong>${escapeHtml(categoryFilterLabel)}</strong>` : ' (รวมทุกสถานะการชำระ)'}</div>
    <table style="table-layout:fixed;">
      <colgroup><col style="width:45%"/><col style="width:15%"/><col style="width:20%"/><col style="width:20%"/></colgroup>
      <thead><tr><th>ประเภทสินค้า / สินค้ายอดนิยม</th><th class="center">จำนวนรายการ</th><th class="center">จำนวนชิ้น</th><th class="right">ยอดรวม (บาท)</th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>บิลที่ยังไม่ได้จ่าย — ค้างชำระทั้งหมด (${outstandingCount} ฉบับ · รวม ${fmt(outstandingTotalDue)} บาท)</h2>
    <table>
      <thead><tr><th>เลขที่</th><th>ลูกค้า</th><th>ประเภท</th><th class="center">วันที่</th><th class="center">อายุ (วัน)</th><th>สถานะ</th><th class="right">ยอดรวม</th><th class="right">ค้างชำระ</th></tr></thead>
      <tbody>${outstandingRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>รายรับ / รายจ่าย (รายรับเพิ่มเติม ${fmt(snapshot.expenses.income)} · รายจ่าย ${fmt(snapshot.expenses.total)} บาท)</h2>
    <table>
      <thead><tr><th style="width:70px">ประเภท</th><th>หมวด</th><th>รายละเอียด</th><th class="right">จำนวน (บาท)</th></tr></thead>
      <tbody>${expenseRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>การเบิกกระดาษ (${paperItems.length} รายการ)</h2>
    <table>
      <thead><tr><th style="width:55px">เวลา</th><th>ประเภทกระดาษ</th><th class="right">จำนวน</th><th>หน่วย</th><th>ผู้เบิก</th><th>วัตถุประสงค์</th></tr></thead>
      <tbody>${paperRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>การเบิกเงินจากคลัง (${snapshot.cashAdvances?.newCount || 0} รายการ · คืน ${fmt(snapshot.cashAdvances?.repaidAmount || 0)} บาท)</h2>
    <table>
      <thead><tr><th>ผู้เบิก</th><th>วัตถุประสงค์</th><th>สถานะ</th><th class="right">จำนวน (บาท)</th></tr></thead>
      <tbody>${advRows}</tbody>
    </table>
  </div>

  ${notes ? `<div class="section"><h2>หมายเหตุ</h2><div class="notes">${escapeHtml(notes)}</div></div>` : ''}

  <div class="footer">
    <div><div class="sig">ผู้บันทึก / ผู้ปิดยอด</div></div>
    <div><div class="sig">ผู้ตรวจสอบ</div></div>
  </div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };<\/script>
</body></html>`;

  const w = openPrintWindowOrSurface('width=900,height=1000');
  if (!w) {
    throw new Error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ — กรุณาอนุญาต popup ในเบราว์เซอร์');
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
