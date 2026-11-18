import { describe, it, expect, vi, afterEach } from 'vitest';
import { FILM_NAV_EVENT, onFilmNavigate, openOrderChat, orderChatDraft } from '@/film-shop/lib/filmNav';

describe('เปิดแชตลูกค้าจากออเดอร์', () => {
  afterEach(() => vi.restoreAllMocks());

  it('สร้างข้อความตั้งต้นจากเลขออเดอร์', () => {
    expect(orderChatDraft({ orderNo: 'FS-001', orderTitle: 'สติกเกอร์' })).toContain('FS-001');
    expect(orderChatDraft({ orderNo: null })).toBe('');
  });

  it('ยิงอีเวนต์ไปหน้า inbox พร้อมบริบทออเดอร์', () => {
    const seen: any[] = [];
    const off = onFilmNavigate((page, filter) => seen.push({ page, filter }));
    openOrderChat({ orderId: 'o1', orderNo: 'FS-002', customerId: 'c1' });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].page).toBe('inbox');
    expect(seen[0].filter.inbox.orderId).toBe('o1');
    expect(seen[0].filter.inbox.draft).toContain('FS-002');
    expect(typeof seen[0].filter.inbox.nonce).toBe('number');
  });

  it('ใช้ชื่ออีเวนต์เดิมของ nav bus', () => {
    expect(FILM_NAV_EVENT).toBe('film-shop:navigate');
  });
});
