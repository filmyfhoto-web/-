import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { filmLineTotal, FILM_RECEIPT_COLUMNS } from '@/film-shop/lib/filmItemPricing';
import { deliveryDedupKey } from '@/film-shop/lib/queueDeliveryNotify';
import { canDeliverOrder, deliverBlockReason } from '@/film-shop/workcenter/lib/workcenter';
import { buildFilmDocPayload, emptyFilmDraft } from '@/film-shop/lib/filmDocIssue';

const read = (p: string) => readFileSync(p, 'utf8');

describe('อ่านไฟล์แบบไม่ใช้เครดิต AI', () => {
  const adapter = read('src/film-shop/lib/fileIntakeAdapter.ts');

  it('เส้นทางอ่านไฟล์ต้องไม่เรียก AI/LLM/edge OCR ใด ๆ', () => {
    for (const bad of ['gemini', 'openai', 'lovable-ai', 'film-intake-extract', 'ai.gateway', 'fetch(']) {
      expect(adapter.toLowerCase()).not.toContain(bad.toLowerCase());
    }
    expect(adapter).not.toContain("'live'");
  });

  it('อ่านไม่ได้ต้อง fallback เป็นกรอกเอง', () => {
    expect(adapter).toContain('FILE_INTAKE_MANUAL_MESSAGE');
    expect(adapter).toContain('อ่านไฟล์นี้ไม่ได้ กรุณากรอกข้อมูลเอง');
    expect(read('src/film-shop/components/queue/ExtractedDataSheet.tsx')).toContain('extract-manual');
  });
});

describe('การ์ดควบคุมกลุ่ม Q รันงาน', () => {
  const page = read('src/film-shop/components/hub/QueueGroupPage.tsx');
  it('มีปุ่มจริงครบ 4 ปุ่มพร้อม handler', () => {
    for (const id of ['q-ctl-check', 'q-ctl-intake', 'q-ctl-summary', 'q-ctl-reload']) {
      expect(page).toContain(id);
    }
    expect(page).toContain('เช็คคิว');
    expect(page).toContain('สรุปงาน');
    expect(page).toContain('grid-cols-2');
    expect(page).toContain('sm:grid-cols-4');
  });
});

describe('สถานะส่งมอบ', () => {
  it('เอกสารไม่เปลี่ยนออเดอร์เป็นส่งมอบแล้ว', () => {
    const draft = emptyFilmDraft('receipt');
    const payload = buildFilmDocPayload({ ...draft, customerName: 'ก' }, 'receipt', 'RC-1');
    expect(payload).not.toHaveProperty('delivered');
    expect(String(payload.status)).toBe('paid');
  });

  it('ปิดงานได้เมื่องานย่อยผ่านตรวจครบเท่านั้น', () => {
    expect(canDeliverOrder([{ status: 'producing' }, { status: 'ready' }] as never)).toBe(false);
    expect(deliverBlockReason([{ status: 'producing' }] as never)).toBeTruthy();
    expect(canDeliverOrder([{ status: 'ready' }, { status: 'done' }] as never)).toBe(true);
  });

  it('คีย์แจ้ง LINE ต้อง idempotent ต่อเหตุการณ์', () => {
    expect(deliveryDedupKey('ready', 'o1')).toBe(deliveryDedupKey('ready', 'o1'));
    expect(deliveryDedupKey('ready', 'o1')).not.toBe(deliveryDedupKey('delivered', 'o1'));
    expect(deliveryDedupKey('ready', 'o1')).not.toBe(deliveryDedupKey('ready', 'o2'));
  });
});

describe('ใบเสร็จ Film Shop — คอลัมน์และสูตร', () => {
  it('ลำดับคอลัมน์ตรงตามที่กำหนด', () => {
    expect([...FILM_RECEIPT_COLUMNS]).toEqual([
      'ลำดับ', 'รายการ', 'ราคาต่อหน่วย', 'ราคา ตร.ม.', 'จำนวน', 'หน่วย', 'กว้าง', 'ยาว',
    ]);
    const preview = read('src/film-shop/components/invoices/InvoicePreview.tsx');
    const order = ['ลำดับ', 'รายการ', 'ราคาต่อหน่วย', 'ราคา ตร.ม.', 'จำนวน', 'หน่วย', 'กว้าง', 'ยาว', 'รวม']
      .map((h) => preview.indexOf(`<th>${h}</th>`) >= 0 ? preview.indexOf(`<th>${h}</th>`) : preview.indexOf(h));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('งานทั่วไป = ราคาต่อหน่วย × จำนวน', () => {
    expect(filmLineTotal({ quantity: 3, price: 120 })).toBe(360);
    expect(filmLineTotal({ quantity: 3, price: 120, discount: 60 })).toBe(300);
  });

  it('งานพื้นที่ = กว้าง × ยาว × จำนวน × ราคา/ตร.ม.', () => {
    expect(filmLineTotal({ width: 2, height: 1.5, quantity: 2, price: 250, areaMode: true })).toBe(1500);
    // ไม่มีกว้าง–ยาว ให้ตกไปสูตรงานทั่วไป
    expect(filmLineTotal({ width: 0, height: 0, quantity: 2, price: 250, areaMode: true })).toBe(500);
  });
});
