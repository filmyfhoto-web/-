/** รับเงินภายหลังเมื่อมีมัดจำ — ตรวจตัวเลขคงเหลือ/เงินทอนที่หน้าจอจริง (mobile 390px) */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueueReceiptSheet } from '@/film-shop/components/queue/QueueReceiptSheet';

vi.mock('@/film-shop/lib/supabase', () => ({ supabase: {} }));

beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { value: 390, writable: true });
  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  } as any));
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
});

const order = { id: 'o1', orderNo: 'FO-1', customerName: 'ครูเมย์', total: 700, paidPreviously: 200 };

describe('QueueReceiptSheet — มัดจำ 200', () => {
  it('final 700 → ต้องรับ 500 และเงินทอนคิดจาก 500', () => {
    render(<QueueReceiptSheet open onOpenChange={() => {}} order={order} />);
    expect(screen.getByTestId('qr-paid-prev').textContent).toContain('200');
    expect(screen.getByTestId('qr-due-now').textContent).toContain('500');
    expect((screen.getByTestId('qr-received') as HTMLInputElement).value).toBe('500');
    fireEvent.change(screen.getByTestId('qr-received'), { target: { value: '600' } });
    expect(screen.getByTestId('qr-change').textContent).toContain('100');
  });

  it('ยอดสุดท้ายต่ำกว่ามัดจำ → บล็อกและแจ้งให้คืนเงินแยก', () => {
    render(<QueueReceiptSheet open onOpenChange={() => {}} order={order} />);
    fireEvent.change(screen.getByTestId('qr-total'), { target: { value: '100' } });
    expect(screen.getByTestId('qr-below-paid').textContent).toContain('คืนเงินแยก');
    expect(screen.getByTestId('qr-confirm')).toBeDisabled();
  });
});
