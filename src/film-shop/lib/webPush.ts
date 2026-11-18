/**
 * "แจ้งเตือนถาวร" — Web Push subscription helpers.
 *
 * The app-shell service worker (vite-plugin-pwa) stays untouched; push runs
 * in its own worker at `/push-sw.js` registered under the narrow `/push/`
 * scope so both can be active at the same time.
 */
import { supabase } from '@/integrations/supabase/client';

export const VAPID_PUBLIC_KEY =
  'BG9jmCNbPi9twNQUp9V4dVoAmssKlb0NZAZsF5OZR2_abcN3VVccRbB3JuzvQV8bprPQMKx4sXfSMFHiQpZisTs';

const SCOPE = '/push/';

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration(SCOPE);
  if (existing?.active && existing.scope.endsWith(SCOPE)) return existing;
  try {
    return await navigator.serviceWorker.register('/push-sw.js', { scope: SCOPE });
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/** Ask for permission, subscribe, and persist the device so the server can reach it. */
export async function enablePush(opts: { app?: string; storeId?: string | null } = {}): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await pushRegistration();
  if (!reg) return 'off';
  await navigator.serviceWorker.ready.catch(() => undefined);

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error('ต้องเข้าสู่ระบบก่อนเปิดแจ้งเตือนถาวร');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: auth.user.id,
      endpoint: json.endpoint ?? sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      app: opts.app ?? 'film-shop',
      store_id: opts.storeId ?? null,
      user_agent: navigator.userAgent.slice(0, 300),
      active: true,
      last_seen_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
  return 'on';
}

/** Stop persistent alerts on this device only. */
export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}

/** Server-side round trip that proves the whole chain works. */
export async function sendPushTest(): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('send-web-push', {
    body: { self: true, title: 'FILM SHOP', body: 'ทดสอบแจ้งเตือนถาวร — ระบบพร้อมใช้งาน', url: '/film-shop' },
  });
  if (error) throw error;
  return { sent: (data as any)?.sent ?? 0, failed: (data as any)?.failed ?? 0 };
}
