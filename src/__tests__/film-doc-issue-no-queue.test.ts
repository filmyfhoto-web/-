import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  emptyFilmDraft, issueFilmDocument, type FilmDraftState, type FilmIssueDeps,
} from '@/film-shop/lib/filmDocIssue';
import type { Invoice } from '@/film-shop/types';

const src = (p: string) => readFileSync(p, 'utf8');

const draft = (mode: FilmDraftState['mode']): FilmDraftState => ({
  ...emptyFilmDraft(mode),
  customerName: 'ลูกค้าทดสอบ',
  items: [{ id: 'i1', name: 'ฟิล์ม', detail: '', quantity: 1, unit: 'ชิ้น', pricePerPiece: 100, discount: 0 }],
});

const deps = () => {
  const addInvoice = vi.fn(async (p: any) => ({ ...p, id: 'inv-1' } as unknown as Invoice));
  const updateInvoice = vi.fn(async () => undefined);
  const d: FilmIssueDeps = {
    invoices: [],
    addInvoice,
    updateInvoice,
    generateInvoiceNumber: (t) => (t === 'receipt' ? 'RC-001' : 'JO-001'),
    refetch: vi.fn(),
  };
  return { d, addInvoice, updateInvoice };
};

describe('การออกเอกสาร Film Shop ต้องไม่แตะ Q รันงาน', () => {
  it('filmDocIssue ไม่ import/เรียก pushJobOrderToQueue', () => {
    const code = src('src/film-shop/lib/filmDocIssue.ts');
    expect(code).not.toMatch(/pushJobOrderToQueue/);
    expect(code).not.toMatch(/queueJobOrderLink/);
  });

  it('DocumentWizard และ DocHelperSheet ไม่มีโค้ดส่งงานเข้า Q', () => {
    for (const f of [
      'src/film-shop/components/documents/DocumentWizard.tsx',
      'src/film-shop/components/documents/DocHelperSheet.tsx',
    ]) {
      const code = src(f);
      expect(code, f).not.toMatch(/pushJobOrderToQueue|queueJobOrderLink/);
    }
  });

  it('ออกใบเสร็จใบเดียว ไม่มีการเขียนคิว', async () => {
    const { d, addInvoice, updateInvoice } = deps();
    const res = await issueFilmDocument(d, draft('receipt'));
    expect(addInvoice).toHaveBeenCalledTimes(1);
    expect(addInvoice.mock.calls[0][0].type).toBe('receipt');
    expect(updateInvoice).not.toHaveBeenCalled();
    expect(res.invoiceId).toBe('inv-1');
    expect(res.message).toContain('ใบเสร็จ');
  });
});
