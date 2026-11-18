/** สร้าง DOM เอกสารชั่วคราวสำหรับดาวน์โหลด/พิมพ์จากสมุดเอกสาร */
export interface RenderDocInput {
  invoice_number: string;
  typeLabel: string;
  shopLabel?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_tax_id?: string | null;
  document_date?: string | null;
  notes?: string | null;
  items?: any;
  subtotal?: number;
  discount?: number;
  deposit?: number;
  total?: number;
  statusLabel?: string;
}

const baht = (n: any) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildDocElement(doc: RenderDocInput): HTMLElement {
  const items: any[] = Array.isArray(doc.items) ? doc.items : [];
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:-10000px;top:0;width:760px;padding:32px;background:#fff;color:#111;font-family:Sarabun,"TH Sarabun New",sans-serif;';
  el.innerHTML = `
    <div style="font-size:12px;color:#666">${doc.shopLabel ?? ''}</div>
    <h1 style="font-size:22px;margin:4px 0 2px">${doc.typeLabel}</h1>
    <div style="font-size:13px">เลขที่: <b>${doc.invoice_number}</b></div>
    <div style="font-size:13px">วันที่: ${
      doc.document_date ? new Date(doc.document_date).toLocaleDateString('th-TH') : '-'
    }</div>
    <div style="margin-top:12px;font-size:13px">
      <div>ลูกค้า: ${doc.customer_name || '-'}</div>
      ${doc.customer_phone ? `<div>โทร: ${doc.customer_phone}</div>` : ''}
      ${doc.customer_address ? `<div>ที่อยู่: ${doc.customer_address}</div>` : ''}
      ${doc.customer_tax_id ? `<div>เลขผู้เสียภาษี: ${doc.customer_tax_id}</div>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:13px">
      <thead><tr style="border-bottom:1px solid #999;text-align:left">
        <th style="padding:4px">รายการ</th><th style="padding:4px;text-align:right">จำนวน</th>
        <th style="padding:4px;text-align:right">ราคา</th><th style="padding:4px;text-align:right">รวม</th>
      </tr></thead>
      <tbody>
        ${items
          .map(
            (i) => `<tr style="border-bottom:1px solid #eee">
          <td style="padding:4px">${i.name ?? i.description ?? '-'}</td>
          <td style="padding:4px;text-align:right">${i.quantity ?? 0} ${i.unit ?? ''}</td>
          <td style="padding:4px;text-align:right">${baht(i.pricePerPiece ?? i.unit_price ?? 0)}</td>
          <td style="padding:4px;text-align:right">${baht(i.total ?? 0)}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:13px;text-align:right">
      <div>รวมเป็นเงิน ${baht(doc.subtotal)}</div>
      <div>ส่วนลด ${baht(doc.discount)}</div>
      <div>มัดจำ ${baht(doc.deposit)}</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px">ยอดสุทธิ ${baht(doc.total)} บาท</div>
      ${doc.statusLabel ? `<div style="color:#555">สถานะ: ${doc.statusLabel}</div>` : ''}
    </div>
    ${doc.notes ? `<div style="margin-top:12px;font-size:12px;color:#555">หมายเหตุ: ${doc.notes}</div>` : ''}
  `;
  return el;
}

/** ใช้ element ชั่วคราวแล้วเก็บกวาดให้เสมอ */
export async function withDocElement<T>(doc: RenderDocInput, fn: (el: HTMLElement) => Promise<T> | T): Promise<T> {
  const el = buildDocElement(doc);
  document.body.appendChild(el);
  try {
    return await fn(el);
  } finally {
    el.remove();
  }
}
