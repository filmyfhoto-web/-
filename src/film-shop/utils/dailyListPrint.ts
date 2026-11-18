import { openPrintWindowOrSurface } from "@/lib/printSurface";
/**
 * Print A4 daily list reports (Sales / Paper Withdrawals / Cash Advances).
 * Self-contained HTML window — Sarabun font + UTF-8.
 */

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const fmtNum = (n: number) =>
  new Intl.NumberFormat('th-TH').format(n || 0);

function thaiDateFull(d: Date) {
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function thaiTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rangeLabel(from: string, to: string) {
  if (from === to) return thaiDateFull(new Date(`${from}T00:00:00`));
  return `${thaiDateFull(new Date(`${from}T00:00:00`))} - ${thaiDateFull(new Date(`${to}T00:00:00`))}`;
}

const escapeHtml = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const baseStyles = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Sarabun','Noto Sans Thai','Tahoma',sans-serif; color: #111; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
  .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { font-size: 20px; color: #1e40af; font-weight: 700; margin: 0; }
  .header .shop { font-size: 14px; margin-top: 4px; font-weight: 600; }
  .header .meta { font-size: 11px; color: #555; margin-top: 4px; }
  .section h2 { font-size: 13px; color: #1e40af; border-left: 4px solid #1e40af; padding-left: 8px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d4d4d8; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eff6ff; font-weight: 600; color: #1e3a8a; }
  .right { text-align: right; }
  .center { text-align: center; }
  .total-row td { font-weight: 700; background: #f9fafb; }
  .summary-grid { display: grid; gap: 8px; margin-top: 6px; }
  .summary-card { border: 1px solid #d4d4d8; border-radius: 6px; padding: 8px; }
  .summary-card .label { font-size: 10px; color: #666; }
  .summary-card .value { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .empty { color: #888; font-style: italic; padding: 6px; text-align: center; }
  .footer { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; font-size: 11px; }
  .sig { border-top: 1px solid #333; padding-top: 4px; text-align: center; margin-top: 50px; }
`;

function openPrint(title: string, body: string) {
  const html = `<!DOCTYPE html><html lang="th"><head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${baseStyles}</style>
</head><body>${body}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };<\/script>
</body></html>`;
  const w = openPrintWindowOrSurface('width=900,height=1000');
  if (!w) { alert('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ============ SALES REPORT ============

export interface SalesReceiptRow {
  receiptNumber: string;
  receiptDate: Date | string;
  customerName: string;
  itemSummary: string;
  paymentType: 'cash' | 'credit' | 'transfer';
  paymentStatus: string; // pending|deposit|paid|credit
  total: number;
}

const PAY_STATUS_LABEL: Record<string, string> = {
  pending: 'ยังไม่จ่าย', deposit: 'มัดจำ', paid: 'จ่ายแล้ว', credit: 'ลงบัญชี',
};

const PAY_TYPE_LABEL: Record<string, string> = {
  cash: 'เงินสด', credit: 'ลงบัญชี', transfer: 'เงินโอน',
};

export function printDailySalesReport(opts: {
  shopName: string;
  date: string; // YYYY-MM-DD
  receipts: SalesReceiptRow[];
}) {
  const { shopName, date, receipts } = opts;
  const total = receipts.reduce((s, r) => s + (r.total || 0), 0);
  const cash = receipts.filter(r => r.paymentType === 'cash').reduce((s, r) => s + r.total, 0);
  const transfer = receipts.filter(r => r.paymentType === 'transfer').reduce((s, r) => s + r.total, 0);
  const credit = receipts.filter(r => r.paymentType === 'credit').reduce((s, r) => s + r.total, 0);

  const byStatus: Record<string, { count: number; total: number }> = {};
  receipts.forEach(r => {
    const k = r.paymentStatus || 'pending';
    byStatus[k] = byStatus[k] || { count: 0, total: 0 };
    byStatus[k].count += 1;
    byStatus[k].total += r.total;
  });

  const rowsHtml = receipts.length
    ? receipts.map((r, i) => {
        const d = new Date(r.receiptDate);
        return `<tr>
          <td class="center">${i + 1}</td>
          <td>${escapeHtml(r.receiptNumber)}</td>
          <td class="center">${thaiTime(d)}</td>
          <td>${escapeHtml(r.customerName || '-')}</td>
          <td>${escapeHtml(r.itemSummary || '-')}</td>
          <td class="center">${PAY_TYPE_LABEL[r.paymentType] || r.paymentType}</td>
          <td class="center">${PAY_STATUS_LABEL[r.paymentStatus] || r.paymentStatus}</td>
          <td class="right">${fmtMoney(r.total)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8" class="empty">ไม่มีรายการขายในวันนี้</td></tr>`;

  const statusHtml = (['paid','deposit','pending','credit'] as const)
    .map(s => `<tr><td>${PAY_STATUS_LABEL[s]}</td><td class="center">${byStatus[s]?.count || 0}</td><td class="right">${fmtMoney(byStatus[s]?.total || 0)}</td></tr>`)
    .join('');

  const body = `
    <div class="header">
      <h1>รายงานการขายประจำวัน</h1>
      <div class="shop">${escapeHtml(shopName)}</div>
      <div class="meta">วันที่ ${thaiDateFull(new Date(`${date}T00:00:00`))}</div>
    </div>
    <div class="section">
      <h2>สรุปยอดขาย</h2>
      <div class="summary-grid" style="grid-template-columns: repeat(5, 1fr);">
        <div class="summary-card"><div class="label">จำนวนบิล</div><div class="value">${fmtNum(receipts.length)} ใบ</div></div>
        <div class="summary-card"><div class="label">เงินสด</div><div class="value">${fmtMoney(cash)}</div></div>
        <div class="summary-card"><div class="label">เงินโอน</div><div class="value">${fmtMoney(transfer)}</div></div>
        <div class="summary-card"><div class="label">ลงบัญชี</div><div class="value">${fmtMoney(credit)}</div></div>
        <div class="summary-card"><div class="label">ยอดรวม</div><div class="value" style="color:#1e40af">${fmtMoney(total)}</div></div>
      </div>
    </div>
    <div class="section">
      <h2>แยกตามสถานะการชำระเงิน</h2>
      <table><thead><tr><th>สถานะ</th><th class="center">จำนวนบิล</th><th class="right">ยอด (บาท)</th></tr></thead>
      <tbody>${statusHtml}<tr class="total-row"><td>รวม</td><td class="center">${receipts.length}</td><td class="right">${fmtMoney(total)}</td></tr></tbody></table>
    </div>
    <div class="section">
      <h2>รายการบิลทั้งหมด</h2>
      <table>
        <thead><tr>
          <th class="center" style="width:30px">#</th>
          <th>เลขที่บิล</th>
          <th class="center" style="width:50px">เวลา</th>
          <th>ลูกค้า</th>
          <th>รายการ</th>
          <th class="center" style="width:55px">ชำระ</th>
          <th class="center" style="width:65px">สถานะ</th>
          <th class="right" style="width:80px">ยอด</th>
        </tr></thead>
        <tbody>${rowsHtml}
          <tr class="total-row"><td colspan="7" class="right">รวมทั้งสิ้น</td><td class="right">${fmtMoney(total)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <div><div class="sig">ผู้บันทึก / ผู้ปิดยอด</div></div>
      <div><div class="sig">ผู้ตรวจสอบ</div></div>
    </div>`;

  openPrint(`รายงานการขาย ${date}`, body);
}

// ============ PAPER WITHDRAWALS ============

export interface PaperWithdrawalRow {
  withdrawn_at: string;
  paper_type: string;
  quantity: number;
  unit: string;
  withdrawn_by: string;
  purpose: string | null;
  note: string | null;
}

export function printPaperWithdrawalReport(opts: {
  shopName: string;
  from: string; to: string;
  rows: PaperWithdrawalRow[];
}) {
  const { shopName, from, to, rows } = opts;
  const byType: Record<string, { qty: number; unit: string }> = {};
  rows.forEach(r => {
    const k = `${r.paper_type} (${r.unit})`;
    byType[k] = byType[k] || { qty: 0, unit: r.unit };
    byType[k].qty += Number(r.quantity) || 0;
  });

  const rowsHtml = rows.length
    ? rows.map((r, i) => {
        const d = new Date(r.withdrawn_at);
        return `<tr>
          <td class="center">${i + 1}</td>
          <td>${thaiDateFull(d)} ${thaiTime(d)}</td>
          <td>${escapeHtml(r.paper_type)}</td>
          <td class="right">${fmtNum(Number(r.quantity))}</td>
          <td class="center">${escapeHtml(r.unit)}</td>
          <td>${escapeHtml(r.withdrawn_by)}</td>
          <td>${escapeHtml(r.purpose || '-')}</td>
          <td>${escapeHtml(r.note || '-')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8" class="empty">ไม่มีรายการเบิกในช่วงวันที่เลือก</td></tr>`;

  const summaryHtml = Object.keys(byType).length
    ? Object.entries(byType).map(([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td class="right">${fmtNum(v.qty)}</td></tr>`).join('')
    : `<tr><td colspan="2" class="empty">-</td></tr>`;

  const body = `
    <div class="header">
      <h1>รายงานการเบิกกระดาษ</h1>
      <div class="shop">${escapeHtml(shopName)}</div>
      <div class="meta">${rangeLabel(from, to)}</div>
    </div>
    <div class="section">
      <h2>สรุปแยกตามประเภทกระดาษ</h2>
      <table><thead><tr><th>ประเภท (หน่วย)</th><th class="right">จำนวนรวม</th></tr></thead>
      <tbody>${summaryHtml}</tbody></table>
    </div>
    <div class="section">
      <h2>รายการเบิกทั้งหมด (${rows.length} รายการ)</h2>
      <table>
        <thead><tr>
          <th class="center" style="width:30px">#</th>
          <th>วันที่ / เวลา</th>
          <th>ประเภท</th>
          <th class="right" style="width:60px">จำนวน</th>
          <th class="center" style="width:50px">หน่วย</th>
          <th>ผู้เบิก</th>
          <th>วัตถุประสงค์</th>
          <th>หมายเหตุ</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="footer">
      <div><div class="sig">ผู้บันทึก</div></div>
      <div><div class="sig">ผู้ตรวจสอบ</div></div>
    </div>`;

  openPrint(`รายงานเบิกกระดาษ ${from}_${to}`, body);
}

// ============ CASH ADVANCES ============

export interface CashAdvanceRow {
  borrowed_at: string;
  borrower_name: string;
  purpose: string;
  status: string;
  amount: number;
  paid_amount: number;
  expense_category?: string | null;
}

const ADV_STATUS: Record<string, string> = {
  open: 'ค้างชำระ', partial: 'คืนบางส่วน', settled: 'ปิดยอด', cancelled: 'ยกเลิก',
};

export function printCashAdvanceReport(opts: {
  shopName: string;
  from: string; to: string;
  rows: CashAdvanceRow[];
}) {
  const { shopName, from, to, rows } = opts;
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.paid_amount || 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + Math.max(0, (r.amount || 0) - (r.paid_amount || 0)), 0);

  const rowsHtml = rows.length
    ? rows.map((r, i) => {
        const d = new Date(r.borrowed_at);
        const outstanding = Math.max(0, (r.amount || 0) - (r.paid_amount || 0));
        return `<tr>
          <td class="center">${i + 1}</td>
          <td>${thaiDateFull(d)} ${thaiTime(d)}</td>
          <td>${escapeHtml(r.borrower_name)}</td>
          <td>${escapeHtml(r.purpose)}</td>
          <td class="center">${ADV_STATUS[r.status] || r.status}</td>
          <td class="right">${fmtMoney(r.amount)}</td>
          <td class="right">${fmtMoney(r.paid_amount)}</td>
          <td class="right" style="color:${outstanding > 0 ? '#b91c1c' : '#15803d'}">${fmtMoney(outstanding)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8" class="empty">ไม่มีรายการเบิกเงินในช่วงวันที่เลือก</td></tr>`;

  const body = `
    <div class="header">
      <h1>รายงานการเบิกเงินจากคลัง</h1>
      <div class="shop">${escapeHtml(shopName)}</div>
      <div class="meta">${rangeLabel(from, to)}</div>
    </div>
    <div class="section">
      <h2>สรุปยอดเบิก</h2>
      <div class="summary-grid" style="grid-template-columns: repeat(4, 1fr);">
        <div class="summary-card"><div class="label">จำนวนรายการ</div><div class="value">${rows.length}</div></div>
        <div class="summary-card"><div class="label">ยอดเบิกรวม</div><div class="value" style="color:#b45309">${fmtMoney(totalAmount)}</div></div>
        <div class="summary-card"><div class="label">ยอดคืนรวม</div><div class="value" style="color:#15803d">${fmtMoney(totalPaid)}</div></div>
        <div class="summary-card"><div class="label">ยอดคงค้าง</div><div class="value" style="color:#b91c1c">${fmtMoney(totalOutstanding)}</div></div>
      </div>
    </div>
    <div class="section">
      <h2>รายการเบิกทั้งหมด</h2>
      <table>
        <thead><tr>
          <th class="center" style="width:30px">#</th>
          <th>วันที่ / เวลา</th>
          <th>ผู้เบิก</th>
          <th>วัตถุประสงค์</th>
          <th class="center" style="width:65px">สถานะ</th>
          <th class="right" style="width:80px">ยอดเบิก</th>
          <th class="right" style="width:80px">คืนแล้ว</th>
          <th class="right" style="width:80px">คงค้าง</th>
        </tr></thead>
        <tbody>${rowsHtml}
          <tr class="total-row">
            <td colspan="5" class="right">รวมทั้งสิ้น</td>
            <td class="right">${fmtMoney(totalAmount)}</td>
            <td class="right">${fmtMoney(totalPaid)}</td>
            <td class="right">${fmtMoney(totalOutstanding)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <div><div class="sig">ผู้บันทึก</div></div>
      <div><div class="sig">ผู้อนุมัติ</div></div>
    </div>`;

  openPrint(`รายงานเบิกเงิน ${from}_${to}`, body);
}
