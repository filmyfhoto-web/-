import { describe, it, expect } from 'vitest';
import { adminGroupOrderText } from '../lib/adminGroupChat';

describe('adminGroupOrderText', () => {
  it('ส่งครบ 4 บรรทัดข้อมูล + บรรทัดปิดท้าย และยอดรวมทศนิยม 2 ตำแหน่ง', () => {
    const lines = adminGroupOrderText({
      orderId: 'abcdef12-3456',
      orderNo: 'FS-0001',
      title: 'ป้ายไวนิล',
      customerName: 'คุณเอ',
      customerPhone: '0812345678',
      total: 1234.5,
    }).split('\n');

    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('📌 ออเดอร์ FS-0001');
    expect(lines[1]).toBe('งาน: ป้ายไวนิล');
    expect(lines[2]).toBe('ลูกค้า: คุณเอ (0812345678)');
    expect(lines[3]).toBe('ยอดรวม: 1,234.50 บาท');
  });

  it('เติม "-" ทุกช่องที่ไม่มีข้อมูล และยังคง 4 บรรทัดเสมอ', () => {
    const lines = adminGroupOrderText({ orderId: 'abcdef1234567890' }).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('📌 ออเดอร์ abcdef12');
    expect(lines[1]).toBe('งาน: -');
    expect(lines[2]).toBe('ลูกค้า: -');
    expect(lines[3]).toBe('ยอดรวม: -');
  });

  it('ยอดจำนวนเต็มและศูนย์ยังเป็นทศนิยม 2 ตำแหน่ง', () => {
    expect(adminGroupOrderText({ orderId: 'x', total: 500 })).toContain('ยอดรวม: 500.00 บาท');
    expect(adminGroupOrderText({ orderId: 'x', total: 0 })).toContain('ยอดรวม: 0.00 บาท');
    expect(adminGroupOrderText({ orderId: 'x', total: 1234567.891 })).toContain('ยอดรวม: 1,234,567.89 บาท');
  });

  it('ไม่มีเบอร์โทร แสดงเฉพาะชื่อ / ค่าว่างถือว่าไม่มีข้อมูล', () => {
    expect(adminGroupOrderText({ orderId: 'x', customerName: 'คุณบี' })).toContain('ลูกค้า: คุณบี');
    expect(adminGroupOrderText({ orderId: 'x', customerName: '  ', title: '   ' })).toContain('ลูกค้า: -');
    expect(adminGroupOrderText({ orderId: 'x', total: Number.NaN })).toContain('ยอดรวม: -');
  });
});