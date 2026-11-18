import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/film-shop/hooks/useUserRole';

/** Pages moved out of the daily Film Shop menu. */
export const FILM_TOOL_ITEMS: { id: string; label: string; desc?: string; adminOnly?: boolean }[] = [
  { id: 'customers', label: 'ข้อมูลลูกค้า', desc: 'รายชื่อลูกค้าทั้งหมด' },
  { id: 'invoices', label: 'เอกสาร (ใบแจ้งหนี้/ใบเสร็จ)', desc: 'ออกและพิมพ์เอกสาร' },
  { id: 'queue', label: 'คิวงาน', desc: 'ลำดับงานผลิต' },
  { id: 'job-board', label: 'บอร์ดคิวงาน', desc: 'รับงาน → กำลังทำ → รอตรวจ → พร้อมส่ง พร้อมมอบหมายพนักงานอัตโนมัติ' },
  { id: 'calculator', label: 'คำนวณราคาไวนิล', desc: 'เครื่องคำนวณราคาตามขนาดงาน' },
  { id: 'jobs', label: 'ติดตามสถานะงานเอกสาร', desc: 'สถานะงานจากใบเสร็จ' },
  
  { id: 'queue-settings', label: 'ตั้งค่าคิวงาน', desc: 'เวลาทำการ กำลังการผลิต และเวลามาตรฐานต่องาน' },
  { id: 'doc-summary', label: 'สรุปเอกสารและยอดขาย', desc: 'ยอดรวมจากเอกสารทั้งหมด' },
  { id: 'reports', label: 'รายงานการขาย' },
  { id: 'audit', label: 'ประวัติการแก้ไข' },
  { id: 'sales-check', label: 'ตรวจสอบยอดขาย', adminOnly: true },
  
  { id: 'employees', label: 'ข้อมูลพนักงาน', adminOnly: true },
  { id: 'admin', label: 'จัดการผู้ใช้ระบบ', adminOnly: true },
  { id: 'systest', label: 'ศูนย์ทดสอบระบบ', desc: 'ทดสอบเว็บแอปสั่งซื้อ, NATTA.Q AI และลิงก์ระบบ ในหน้าเดียว', adminOnly: true },
];

export function FilmToolsPage({ onPageChange }: { onPageChange: (page: string) => void }) {
  const { isAdmin } = useUserRole();
  const [q, setQ] = useState('');
  const items = FILM_TOOL_ITEMS
    .filter((i) => !i.adminOnly || isAdmin)
    .filter((i) => !q.trim() || `${i.label} ${i.desc ?? ''}`.includes(q.trim()));

  return (
    <div className="space-y-4 max-w-3xl" data-testid="film-tools-page">
      <div>
        <h2 className="text-xl font-bold">เมนูอื่น ๆ</h2>
        <p className="text-sm text-muted-foreground">เอกสาร ลูกค้า รายงาน และค่าทางเทคนิค รวมไว้ที่นี่</p>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเครื่องมือ" className="pl-9 h-11 rounded-xl" />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">ไม่พบเครื่องมือที่ค้นหา</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <Button
              key={i.id}
              variant="outline"
              className="h-auto justify-start rounded-2xl px-4 py-3 text-left"
              onClick={() => onPageChange(i.id)}
            >
              <span className="block">
                <span className="block font-semibold text-sm">{i.label}</span>
                {i.desc && <span className="block text-xs text-muted-foreground">{i.desc}</span>}
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
