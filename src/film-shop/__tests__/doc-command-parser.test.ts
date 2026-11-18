import { describe, expect, it } from 'vitest';
import {
  parseDocCommand,
  computeDraftTotals,
  canFinalize,
  resolveThaiDate,
  detectDocIntent,
  formatThaiDate,
  type DraftFields,
} from '@/film-shop/lib/docCommand';

const NOW = new Date('2026-08-07T03:00:00Z'); // 10:00 น. Bangkok, วันศุกร์

describe('doc command parser', () => {
  it('turns a typed Thai command into an editable draft', () => {
    const f = parseDocCommand(
      'ออกใบสั่งจ้าง ร้าน NATTAWORKS ให้คุณสมชาย ป้ายไวนิล 2 ผืน ผืนละ 500 บาท นัดรับพรุ่งนี้',
      NOW,
    );
    expect(f.docType).toBe('job_order');
    expect(f.shopKey).toBe('film');
    expect(f.customerName).toContain('สมชาย');
    expect(f.items[0]).toMatchObject({ quantity: 2, unit: 'ผืน', unitPrice: 500 });
    expect(f.dueAtISO?.startsWith('2026-08-08')).toBe(true);
    expect(f.missing).toHaveLength(0);
  });

  it('resolves Thai relative dates in Asia/Bangkok', () => {
    expect(resolveThaiDate('วันนี้', NOW)?.startsWith('2026-08-07')).toBe(true);
    expect(resolveThaiDate('พรุ่งนี้', NOW)?.startsWith('2026-08-08')).toBe(true);
    // said on a Friday, "วันศุกร์" means the next one
    expect(resolveThaiDate('วันศุกร์', NOW)?.startsWith('2026-08-14')).toBe(true);
    expect(resolveThaiDate('15/9', NOW)?.startsWith('2026-09-15')).toBe(true);
    expect(resolveThaiDate('ไม่มีวันที่', NOW)).toBeUndefined();
    expect(formatThaiDate('2026-08-08T17:00:00+07:00')).toContain('2569');
  });

  it('reports missing price / customer / shop and blocks finalizing', () => {
    const f = parseDocCommand('ออกใบเสนอราคา สติกเกอร์ 10 แผ่น', NOW);
    expect(f.missing).toContain('ร้าน');
    expect(f.missing).toContain('ชื่อลูกค้า');
    expect(f.missing).toContain('ราคาต่อหน่วย');
    expect(canFinalize(f).ok).toBe(false);
  });

  it('blocks unpaid receipts and allows paid ones', () => {
    const unpaid = parseDocCommand(
      'ออกใบเสร็จ ร้านการพิมพ์ ให้คุณมานี นามบัตร 1 กล่อง ราคา 300',
      NOW,
    );
    expect(unpaid.paymentStatus).toBe('unpaid');
    expect(canFinalize(unpaid).ok).toBe(false);

    const paid = parseDocCommand(
      'ออกใบเสร็จ ร้านการพิมพ์ ให้คุณมานี นามบัตร 1 กล่อง ราคา 300 ชำระแล้ว โอน',
      NOW,
    );
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.paymentMethod).toBe('โอนเงิน');
    expect(canFinalize(paid).ok).toBe(true);
  });

  it('detects the document intent used by the LINE webhook', () => {
    expect(detectDocIntent('ขอใบเสนอราคาหน่อยครับ')).toBe('quotation');
    expect(detectDocIntent('สวัสดีครับ')).toBeNull();
  });

  it('computes totals deterministically', () => {
    const items = [{ quantity: 2, unitPrice: 500, discount: 0 }];
    expect(computeDraftTotals(items, { vatMode: 'none' }).total).toBe(1000);

    const ex = computeDraftTotals(items, { vatMode: 'exclusive', vatRate: 7 });
    expect(ex.vatAmount).toBe(70);
    expect(ex.total).toBe(1070);

    const inc = computeDraftTotals(items, { vatMode: 'inclusive', vatRate: 7 });
    expect(inc.vatAmount).toBe(65.42);
    expect(inc.total).toBe(1000);

    const wht = computeDraftTotals(items, { vatMode: 'exclusive', whtRate: 3, deposit: 200 });
    expect(wht.whtAmount).toBe(30);
    expect(wht.total).toBe(1040);
    expect(wht.amountDue).toBe(840);
  });

  it('requires a tax id for a tax receipt', () => {
    const f: DraftFields = parseDocCommand(
      'ออกใบกำกับภาษี ร้านคัลเลอร์แล็ป ให้บริษัทเอบีซี งานพิมพ์ 5 ชุด ชุดละ 100 ชำระแล้ว',
      NOW,
    );
    expect(f.docType).toBe('tax_receipt');
    expect(f.missing).toContain('เลขผู้เสียภาษี');
  });
});