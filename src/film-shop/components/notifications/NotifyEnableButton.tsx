import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  ensureNotificationsEnabled,
  notifyPermission,
  showDesktopNotification,
  type NotifySupport,
} from '@/film-shop/lib/desktopNotify';
import { primeNotificationSound, playNotificationSound } from '@/film-shop/lib/notifySound';

/**
 * ปุ่มเปิดแจ้งเตือน + เสียง สำหรับมือถือที่ติดตั้งเป็นแอป (Add to Home Screen)
 * เมื่ออนุญาตแล้วสถานะจะถูกจำไว้ ไม่ต้องกดใหม่ทุกครั้งที่เปิดแอป
 */
export function NotifyEnableButton({ className }: { className?: string }) {
  const [state, setState] = useState<NotifySupport>('default');

  useEffect(() => { setState(notifyPermission()); }, []);

  if (state === 'unsupported') return null;

  const granted = state === 'granted';
  const denied = state === 'denied';

  const onClick = async () => {
    primeNotificationSound();
    if (granted) {
      playNotificationSound();
      showDesktopNotification('ทดสอบแจ้งเตือน FILM SHOP', 'ระบบแจ้งเตือนพร้อมใช้งานแล้ว');
      toast.success('แจ้งเตือนเปิดอยู่แล้ว — ส่งทดสอบให้แล้ว');
      return;
    }
    const res = await ensureNotificationsEnabled();
    setState(res);
    if (res === 'granted') toast.success('เปิดแจ้งเตือนแล้ว ระบบจะจำไว้ให้ถาวร');
    else if (res === 'denied') toast.error('เบราว์เซอร์ปิดแจ้งเตือนไว้ — เปิดใหม่ได้ที่ตั้งค่าเว็บไซต์');
    else toast.message('ยังไม่ได้อนุญาต ลองกดอีกครั้ง');
  };

  const Icon = granted ? BellRing : denied ? BellOff : Bell;

  return (
    <Button
      type="button"
      size="sm"
      variant={granted ? 'outline' : 'default'}
      data-testid="fs-notify-enable"
      className={className}
      onClick={() => void onClick()}
    >
      <Icon className="mr-1 h-4 w-4" />
      {granted ? 'ทดสอบแจ้งเตือน' : denied ? 'แจ้งเตือนถูกปิด' : 'เปิดแจ้งเตือน'}
    </Button>
  );
}