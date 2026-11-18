/**
 * Tiny event bus so any deep component (header bells, alert cards) can jump to
 * a Film Shop page without prop drilling — FilmShopApp listens and switches
 * `currentPage` in place, so nothing ever navigates away from this single app.
 */
export interface FilmNavFilter {
  paymentStatus?: string;
  openCashDrawer?: boolean;
  previewInvoiceId?: string;
  autoFocus?: boolean;
  statusBucket?: string;
  /** ไฮไลต์/เปิดออเดอร์นี้ทันที (มาจากปุ่มในแจ้งเตือน Web Push / LINE) */
  highlightOrderId?: string;
  /** id ของแจ้งเตือนที่ถูกกดมา (ใช้ไฮไลต์การ์ดในศูนย์แจ้งเตือน) */
  highlightNotificationId?: string;
  /** เปิดกล่องข้อความพร้อมบริบทออเดอร์ (ใช้กับหน้า inbox) */
  inbox?: InboxTarget;
}

/** ปลายทางแชตที่ต้องการเปิด — ระบุอย่างน้อยหนึ่งอย่างเพื่อค้นหาห้องแชต */
export interface InboxTarget {
  conversationId?: string | null;
  customerId?: string | null;
  lineUserId?: string | null;
  orderId?: string | null;
  orderNo?: string | null;
  orderTitle?: string | null;
  /** ข้อความตั้งต้นในช่องพิมพ์ (ถ้าไม่ส่งมา จะสร้างจากเลขออเดอร์ให้) */
  draft?: string;
  /** ใช้บังคับให้ effect ทำงานซ้ำเมื่อกดปุ่มเดิม */
  nonce?: number;
}

/** ข้อความตั้งต้นมาตรฐานเมื่อเปิดแชตจากออเดอร์ */
export function orderChatDraft(t: Pick<InboxTarget, 'orderNo' | 'orderTitle'>): string {
  if (!t.orderNo) return '';
  return `เกี่ยวกับออเดอร์ ${t.orderNo}${t.orderTitle ? ` (${t.orderTitle})` : ''}\n`;
}

/** เปิดแชตลูกค้าในกล่องข้อความ พร้อมบริบทออเดอร์ทันที */
export function openOrderChat(target: InboxTarget) {
  filmNavigate('inbox', {
    inbox: {
      ...target,
      draft: target.draft ?? orderChatDraft(target),
      nonce: Date.now(),
    },
  });
}

export const FILM_NAV_EVENT = 'film-shop:navigate';

export function filmNavigate(page: string, filter?: FilmNavFilter) {
  window.dispatchEvent(new CustomEvent(FILM_NAV_EVENT, { detail: { page, filter } }));
}

export function onFilmNavigate(handler: (page: string, filter?: FilmNavFilter) => void) {
  const listener = (e: Event) => {
    const d = (e as CustomEvent).detail as { page: string; filter?: FilmNavFilter } | undefined;
    if (d?.page) handler(d.page, d.filter);
  };
  window.addEventListener(FILM_NAV_EVENT, listener);
  return () => window.removeEventListener(FILM_NAV_EVENT, listener);
}

/** Where a given ops notification should take the user. */
export function alertTarget(a: { group?: number; kind?: string; orderId?: string | null }): { page: string; filter?: FilmNavFilter } {
  if (a.orderId) return { page: 'orders', filter: { highlightOrderId: a.orderId } };
  if (a.group === 2 || a.kind?.startsWith('nattaq')) return { page: 'inbox' };
  return { page: 'orders' };
}

/**
 * ลิงก์เข้าแอปสำหรับปุ่มในแจ้งเตือน (Web Push / LINE) — เปิดหน้าที่ถูกต้อง
 * และไฮไลต์รายการนั้นทันที เช่น /film-shop/app?p=orders&n=<id>&o=<orderId>
 */
export function alertUrl(a: { id?: string; group?: number; kind?: string; orderId?: string | null }): string {
  const t = alertTarget(a);
  const q = new URLSearchParams({ p: t.page });
  if (a.id) q.set('n', a.id);
  if (a.orderId) q.set('o', a.orderId);
  return `/film-shop?${q.toString()}`;
}
