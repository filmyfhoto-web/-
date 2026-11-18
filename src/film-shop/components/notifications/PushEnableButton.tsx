import { useEffect, useState } from 'react';
import { BellRing, BellOff, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { disablePush, enablePush, getPushState, sendPushTest, type PushState } from '@/film-shop/lib/webPush';

/**
 * "แจ้งเตือนถาวร" — Web Push. Unlike the in-page notification button this
 * keeps alerting after the app is closed, because delivery runs in the push
 * service worker instead of the open tab.
 */
export function PushEnableButton({ className, storeId }: { className?: string; storeId?: string | null }) {
  const [state, setState] = useState<PushState>('off');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void getPushState().then(setState); }, []);

  if (state === 'unsupported') return null;

  const on = state === 'on';
  const denied = state === 'denied';

  const onClick = async () => {
    setBusy(true);
    try {
      if (denied) {
        toast.error('เบราว์เซอร์ปิดแจ้งเตือนไว้ — เปิดใหม่ได้ที่ตั้งค่าเว็บไซต์ของเครื่อง');
        return;
      }
      if (on) {
        const res = await sendPushTest();
        toast.success(res.sent > 0 ? `ส่งทดสอบไปยัง ${res.sent} อุปกรณ์แล้ว` : 'ยังไม่พบอุปกรณ์ที่เปิดรับแจ้งเตือน');
        return;
      }
      const next = await enablePush({ app: 'film-shop', storeId });
      setState(next);
      if (next === 'on') toast.success('เปิดแจ้งเตือนถาวรแล้ว — จะเด้งแม้ปิดแอป');
      else if (next === 'denied') toast.error('ไม่ได้รับอนุญาตให้แจ้งเตือน');
      else toast.message('ยังเปิดไม่สำเร็จ ลองอีกครั้ง');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'เปิดแจ้งเตือนถาวรไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const onLongPress = async () => {
    if (!on) return;
    setBusy(true);
    try { setState(await disablePush()); toast.message('ปิดแจ้งเตือนถาวรบนเครื่องนี้แล้ว'); }
    finally { setBusy(false); }
  };

  const Icon = busy ? Loader2 : on ? BellRing : denied ? BellOff : Smartphone;

  return (
    <Button
      type="button"
      size="sm"
      variant={on ? 'outline' : 'default'}
      disabled={busy}
      data-testid="fs-push-enable"
      className={className}
      onClick={() => void onClick()}
      onContextMenu={(e) => { e.preventDefault(); void onLongPress(); }}
      title={on ? 'กดเพื่อทดสอบ · กดค้าง/คลิกขวาเพื่อปิดบนเครื่องนี้' : 'เปิดแจ้งเตือนถาวรบนเครื่องนี้'}
    >
      <Icon className={`mr-1 h-4 w-4${busy ? ' animate-spin' : ''}`} />
      {on ? 'แจ้งเตือนถาวร: เปิด' : denied ? 'แจ้งเตือนถูกปิด' : 'เปิดแจ้งเตือนถาวร'}
    </Button>
  );
}
