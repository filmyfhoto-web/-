import { supabase } from '@/integrations/supabase/client';

/**
 * รีเฟรชการ์ดคิวงานในกลุ่ม LINE ทันทีเมื่อสถานะงานเปลี่ยน
 * ยิงแบบ fire-and-forget และรวมการเรียกที่ถี่เกินไปให้เหลือครั้งเดียว (debounce)
 * เพื่อไม่ให้กลุ่ม LINE ถูกสแปมตอนลากบอร์ดหลายงานติดกัน
 */
let timer: ReturnType<typeof setTimeout> | null = null;

export function refreshLineQueueCard(delayMs = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void supabase.functions
      .invoke('line-queue-broadcast', { body: {} })
      .catch((e) => console.warn('line-queue-broadcast failed', e));
  }, delayMs);
}
