/**
 * เส้นทางหน้าปลายทางจริงของเมนู "บัญชีของฉัน" ฝั่งลูกค้า
 * ใช้ร่วมกันระหว่างหน้า Account, ตัว router และเทสต์กันถอยหลัง
 * (ทุกค่าในนี้ต้องมี <Route> จริงใน src/App.tsx)
 */
export const ACCOUNT_ROUTES = {
  pending: "/account/orders/pending",
  history: "/account/orders/history",
  status: "/account/orders/status",
  notifyTest: "/account/notify-test",
  documents: "/account/documents",
  upload: "/account/upload",
  tracking: "/account/tracking",
  addresses: "/account/addresses",
  shop: "/account/shop",
  coupons: "/account/coupons",
  contact: "/account/contact",
  excel: "/account/excel",
  allHistory: "/account/history",
  settings: "/account",
} as const;

export type AccountRouteKey = keyof typeof ACCOUNT_ROUTES;

/** ปลายทางของการ์ดสถานะ 4 ช่องบนหน้าบัญชี */
export const BUCKET_ROUTES: Record<string, string> = {
  pending: ACCOUNT_ROUTES.pending,
  issued: `${ACCOUNT_ROUTES.documents}?tab=issued`,
  received: `${ACCOUNT_ROUTES.documents}?tab=received`,
  all: ACCOUNT_ROUTES.history,
};

export const trackingRoute = (orderId: string) => `${ACCOUNT_ROUTES.tracking}/${orderId}`;
