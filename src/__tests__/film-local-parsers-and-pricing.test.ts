import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { readLocalFileText, pdfItemsToText, canReadLocally } from '@/film-shop/lib/localFileText';
import { localExtract } from '@/film-shop/lib/fileIntakeAdapter';
import { filmItemTotal, isAreaLine, FILM_RECEIPT_COLUMNS } from '@/film-shop/lib/filmItemPricing';

// jsdom File ไม่มี arrayBuffer()/text() จึงสร้าง stub ที่มี API เท่าที่ parser ใช้
const mkFile = (data: ArrayBuffer | string, name: string): File => {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
  return {
    name,
    type: '',
    arrayBuffer: async () => buf,
    text: async () => new TextDecoder().decode(new Uint8Array(buf)),
  } as unknown as File;
};

describe('parser ในเครื่อง (ไม่มี network / AI)', () => {
  it('อ่าน .xlsx ได้จริง', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ลูกค้า', 'บริษัท ทดสอบ จำกัด'], ['โทร', '0812345678']]), 'S1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const text = await readLocalFileText(mkFile(buf, 'a.xlsx'));
    expect(text).toContain('บริษัท ทดสอบ จำกัด');
    expect(text).toContain('0812345678');
  });

  it('อ่าน .docx ได้จริง', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>ลูกค้า: ร้านทดสอบ &amp; บุตร</w:t></w:r></w:p><w:p><w:r><w:t>โทร 0899999999</w:t></w:r></w:p></w:body></w:document>');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const text = await readLocalFileText(mkFile(buf, 'a.docx'));
    expect(text).toContain('ร้านทดสอบ & บุตร');
    expect(text).toContain('0899999999');
  });

  it('อ่าน .csv ได้จริง', async () => {
    const text = await readLocalFileText(mkFile('ชื่อลูกค้า,ราคา\nคุณเอ,100', 'a.csv'));
    expect(text).toContain('คุณเอ');
  });

  it('แปลง text item ของ PDF เป็นบรรทัดตามแกน Y', () => {
    const out = pdfItemsToText([
      { str: 'ใบเสนอราคา', transform: [1, 0, 0, 1, 0, 900] },
      { str: 'ลูกค้า: ', transform: [1, 0, 0, 1, 0, 600] },
      { str: 'คุณบี', transform: [1, 0, 0, 1, 50, 600] },
    ]);
    expect(out.split('\n')).toEqual(['ใบเสนอราคา', 'ลูกค้า: คุณบี']);
  });

  it('ไฟล์ .ai/.psd/รูป อ่านไม่ได้ → บอกให้กรอกเอง และไม่เรียก fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch' as never);
    expect(canReadLocally({ name: 'art.ai' })).toBe(false);
    await expect(localExtract(mkFile('x', 'art.psd'))).rejects.toThrow('อ่านไฟล์นี้ไม่ได้ กรุณากรอกข้อมูลเอง');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('localExtract อ่าน xlsx จริงโดยไม่เรียก fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch' as never);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['บริษัท ทดสอบ จำกัด'], ['โทร 0812345678']]), 'S1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const res = await localExtract(mkFile(buf, 'q.xlsx'));
    expect(res.mode).toBe('local');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('สูตรราคาใบเสร็จ Film Shop (สองคอลัมน์แยกกัน)', () => {
  it('งานทั่วไปใช้ราคาต่อหน่วย × จำนวน', () => {
    expect(filmItemTotal({ quantity: 3, pricePerPiece: 50, pricePerSqm: 999 })).toBe(150);
  });

  it('งานพื้นที่ใช้ กว้าง × ยาว × จำนวน × ราคา/ตร.ม.', () => {
    const line = { width: 2, height: 1.5, quantity: 2, pricePerPiece: 999, pricePerSqm: 100, areaMode: true };
    expect(isAreaLine(line)).toBe(true);
    expect(filmItemTotal(line)).toBe(600);
  });

  it('หักส่วนลดและไม่ติดลบ', () => {
    expect(filmItemTotal({ quantity: 1, pricePerPiece: 100, discount: 250 })).toBe(0);
  });

  it('ลำดับ 8 คอลัมน์แรกถูกต้อง', () => {
    expect(FILM_RECEIPT_COLUMNS.slice(0, 8)).toEqual([
      'ลำดับ', 'รายการ', 'ราคาต่อหน่วย', 'ราคา ตร.ม.', 'จำนวน', 'หน่วย', 'กว้าง', 'ยาว',
    ]);
  });
});

describe('toMeters / lineAreaSqm / autoLineTotal / resolveLineTotal (Goal B)', () => {
  it('toMeters แปลง cm เป็น m ด้วยการหาร 100 และ m คงค่าเดิม', async () => {
    const { toMeters } = await import('@/film-shop/lib/filmItemPricing');
    expect(toMeters(150, 'cm')).toBe(1.5);
    expect(toMeters(1.5, 'm')).toBe(1.5);
    expect(toMeters(1.5)).toBe(1.5); // default = m
  });

  it('lineAreaSqm = กว้าง(ม.) × ยาว(ม.) แม้กรอกเป็น cm', async () => {
    const { lineAreaSqm } = await import('@/film-shop/lib/filmItemPricing');
    expect(lineAreaSqm({ width: 150, height: 250, unit: 'cm' })).toBeCloseTo(3.75, 6);
    expect(lineAreaSqm({ width: 1.5, height: 2.5, unit: 'm' })).toBeCloseTo(3.75, 6);
  });

  it('autoLineTotal เท่ากับ filmItemTotal เดิมเมื่อไม่ระบุหน่วย (ปริยาย = เมตร)', async () => {
    const { autoLineTotal } = await import('@/film-shop/lib/filmItemPricing');
    const line = { width: 2, height: 1.5, quantity: 2, pricePerSqm: 100, areaMode: true };
    expect(autoLineTotal(line)).toBe(filmItemTotal(line));
  });

  it('autoLineTotal คำนวณถูกเมื่อกรอกกว้าง/ยาวเป็น cm', async () => {
    const { autoLineTotal } = await import('@/film-shop/lib/filmItemPricing');
    // 150cm x 250cm = 1.5m x 2.5m = 3.75 sqm, x 100 บาท/ตรม x 1 = 375
    expect(autoLineTotal({ width: 150, height: 250, unit: 'cm', quantity: 1, pricePerSqm: 100, areaMode: true })).toBe(375);
  });

  it('resolveLineTotal ใช้ราคาที่แก้เอง (manualPrice) แทนการคำนวณอัตโนมัติ', async () => {
    const { resolveLineTotal } = await import('@/film-shop/lib/filmItemPricing');
    const manual = resolveLineTotal({
      width: 2, height: 1.5, quantity: 2, pricePerSqm: 100, areaMode: true,
      manualPrice: true, manualTotal: 999,
    });
    expect(manual).toBe(999);
  });

  it('resolveLineTotal ไม่คำนวณทับราคาที่แก้เองแม้กว้าง/ยาว/จำนวนเปลี่ยน (ต้องเรียกซ้ำด้วยค่าที่ต่างกัน)', async () => {
    const { resolveLineTotal } = await import('@/film-shop/lib/filmItemPricing');
    const base = { pricePerSqm: 100, areaMode: true, manualPrice: true, manualTotal: 500 };
    expect(resolveLineTotal({ ...base, width: 1, height: 1, quantity: 1 })).toBe(500);
    expect(resolveLineTotal({ ...base, width: 5, height: 5, quantity: 10 })).toBe(500);
  });

  it('resolveLineTotal กลับไปคำนวณอัตโนมัติทันทีเมื่อปิด manualPrice', async () => {
    const { resolveLineTotal, autoLineTotal } = await import('@/film-shop/lib/filmItemPricing');
    const input = { width: 2, height: 1.5, quantity: 2, pricePerSqm: 100, areaMode: true };
    expect(resolveLineTotal({ ...input, manualPrice: false, manualTotal: 999 })).toBe(autoLineTotal(input));
  });
});

describe('ใบเสร็จที่ออกจากใบสั่งจ้างต้องได้ยอดรวมของแต่ละรายการเหมือนกันทุกประการ (Goal B)', () => {
  it('buildReceiptFromJobOrder คัดลอก item.total (รวม manualPrice) แบบสแนปช็อต ไม่คำนวณสูตรใหม่', async () => {
    const { buildReceiptFromJobOrder } = await import('@/film-shop/lib/jobOrderFlow');
    const jobOrder = {
      id: 'jo-1',
      invoiceNumber: 'JO-0001',
      type: 'job_order' as const,
      customerName: 'ลูกค้าทดสอบ',
      items: [
        { id: 'i1', name: 'ป้ายไวนิล', width: 2, height: 1.5, pricePerSqm: 100, quantity: 2, unit: 'ตร.ม.', discount: 0, pricePerPiece: 0, total: 999, manualPrice: true, dimUnit: 'm' as const },
        { id: 'i2', name: 'สติกเกอร์', width: 0, height: 0, pricePerSqm: 0, quantity: 3, unit: 'ชิ้น', discount: 0, pricePerPiece: 50, total: 150 },
      ],
      subtotal: 1149,
      deposit: 0,
      discount: 0,
      total: 1149,
      amountDue: 0,
      status: 'pending' as const,
      jobStatus: 'completed' as const,
      createdAt: new Date(),
    };
    const receipt = buildReceiptFromJobOrder(jobOrder, 'RC-0001');
    expect(receipt.items.map((i) => i.total)).toEqual([999, 150]);
    expect(receipt.items[0].manualPrice).toBe(true);
    expect(receipt.total).toBe(jobOrder.total);
    expect(receipt.subtotal).toBe(jobOrder.subtotal);
  });
});
