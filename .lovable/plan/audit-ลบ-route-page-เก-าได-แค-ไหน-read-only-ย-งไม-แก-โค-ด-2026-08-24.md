# Audit: ลบ route/page เก่าได้แค่ไหน (read-only, ยังไม่แก้โค้ด)

คำตอบสั้น: ลบได้ **บางส่วน** ไม่ควรลบทั้งหมด เพราะมี 3 อย่างที่ยังยิงเข้ามาจากนอกแอป — Edge Functions ส่งลิงก์ `/receipts/film...` และ `/admin/orders/<id>` เข้ากลุ่ม LINE, PWA manifests ชี้ `/launch`, และลิงก์โทเคนสาธารณะ `/po/:token`, `/fs/:token`

---

## (A) ลบได้ค่อนข้างปลอดภัย — ลบทั้ง route + page + import

| รายการ | ไฟล์/บรรทัด | เหตุผล |
|---|---|---|
| `src/pages/admin/Orders.tsx` | ไม่มี route ใน `src/App.tsx` เลย (ตรวจแล้ว) | เป็นไฟล์กำพร้า ไม่มีใคร import — ลบได้ทันที (หมายเหตุ: ไฟล์นี้เพิ่งถูกแก้ในเทิร์นก่อน แต่ไม่ได้ถูกเรนเดอร์จริง) |
| `src/pages/admin/AppShortcuts.tsx` | orphan | route `/admin/app-shortcuts` เป็น `Navigate` ไป `/admin/shop-home` แล้ว (App.tsx:396) ตัวเพจไม่ถูก import |
| `src/pages/admin/ShopPromos.tsx` | orphan | route `/admin/shop-promos` เป็น `Navigate` (App.tsx:412) |
| `src/pages/receipts/settings/Settings.tsx` | orphan (ใช้ `Placeholders.tsx > ReceiptsSettings` แทน, App.tsx:185) | ต้องยืนยันซ้ำว่าไม่มี import แบบ relative ก่อนลบ |
| กลุ่มหน้า LINE OA UI ที่ปิดด้วย `LINE_OA_UI=false` ทั้งบล็อก (App.tsx:400–431) | `LineNotifications, AutoBindHistory, LineWebhookEvents, LineWebhookStatus, LineRecipients, ReplyTemplates, Inbox, LineConnectionTest, LineWebhookTest, LineSecretVault, LineIdentityStatus, LineSettings, LineDeliveryLog, LineVerifyWebhookLog, LineRoomAdmins, LineBindings, LinePhoneBindings, LineCallbacks, LineSummary, LineLoginLogs` | ทุกตัวเป็น UI อ่านผลอย่างเดียว ไม่มี webhook/callback ผูกกับ path เหล่านี้ (webhook จริงอยู่ที่ `supabase/functions/line-webhook`) — ลบเพจได้ แต่โปรดเก็บ `/admin/line-groups` (ระบบกลุ่มบอท) ไว้ |
| หน้า ops เก่าที่ปิดด้วย `LEGACY_OPS_MENUS=false` | `Notifications.tsx, OrderAlerts.tsx, NotificationCenter.tsx, AlertStats.tsx` (App.tsx:378–382) | redirect ไป `/admin/home` อยู่แล้ว |
| `/admin/automation-demo` (App.tsx:288) + `src/pages/dev/AutomationDemo.tsx` | หน้าเดโม ไม่บันทึกจริง | ลบได้ถ้าไม่ได้ใช้สาธิต |
| `/film-intake-preview` + `src/pages/FileIntakePreview.tsx` (App.tsx:492) | หน้าทดลองอ่านไฟล์แนบ ไม่เชื่อมคิวจริง | ลบได้ |

ผลกระทบที่ต้องแก้ตามไปด้วย: `src/lib/legacyUi.ts` (ลบธง `LINE_OA_UI`/`LEGACY_OPS_MENUS` ทิ้ง), `src/__tests__/ops-menus-retired.test.ts` (ทั้งไฟล์ตรวจว่ามี route ที่มีคำว่า `LEGACY_OPS_MENUS` — จะพังทันที), `src/lib/routeRegistry.ts` (`LEGACY_REDIRECTS` บรรทัด 25–40, `RETIRED_TARGETS` 43–47, `ROUTE_PATHS` 131–163 ซึ่งมี `/admin/inbox`, `/admin/line-settings`, `/admin/order-alerts`), `src/__tests__/route-registry.test.ts` (parse App.tsx จริง), `tests/e2e/admin-guest-orders-status-filter.spec.ts`

---

## (B) เก็บ route redirect ไว้ ลบเฉพาะ page implementation

| Route | บรรทัด | เหตุผลที่ต้องคง redirect |
|---|---|---|
| `/receipts/film`, `/receipts/film/*` → `FilmShopEntry` | App.tsx:494–495 | **สำคัญที่สุด** — Edge Functions ยิง URL นี้ให้ลูกค้า/แอดมินคลิกจาก LINE: `send-line-notification/index.ts:142`, `line-webhook/index.ts:712,757,758`, `send-web-push/index.ts:88,95` และ e2e `dashboard-visual-regression.spec.ts:30` ลบไม่ได้จนกว่าจะแก้ฟังก์ชันฝั่งเซิร์ฟเวอร์ให้ชี้ `/film-shop/app` ก่อน |
| `/admin/orders`, `/admin/orders/:id` | App.tsx:363–364 | ลิงก์ในข้อความ LINE/Flex: `line-notify/urls.ts:56-58`, `link-request-notify/_urls.ts:56-58`, `line-config-check/_urls.ts:56-58`, `guest-order-submit/index.ts:365` (มี `?export=pdf/xlsx` ด้วย ซึ่ง redirect ปัจจุบันทิ้ง query) |
| `/quote-status`, `/quote-status/:id` | App.tsx:336–337 | ถูก Disallow ไว้ใน `public/robots.txt:26` = เคยเป็น URL สาธารณะที่ลูกค้าบุ๊กมาร์ก |
| `/s`, `/s/:slug` | App.tsx:292–293 | `src/pages/GuestEntry.tsx:37,119` ยัง `nav("/s")` และ e2e `guest-link-request-flow.spec.ts` เข้าหน้านี้ 4 จุด |
| `/order`, `/o/:token` | App.tsx:269, 366 | อยู่ใน robots.txt และเป็นลิงก์แชร์เก่าที่ถูกยกเลิกโดยตั้งใจ (มี memory ว่าห้ามเปิดกลับ) — ต้องคงให้ตกไปหน้าปลอดภัย |
| `/admin/site-editor`, `/admin/app-shortcuts`, `/admin/shop-promos`, `/admin/myshop`, `/admin/guest-orders` | App.tsx:349, 396, 412, 421, 399 | bookmark ของเจ้าของร้าน + `routeRegistry.LEGACY_REDIRECTS` ใช้ตรวจ; เก็บบรรทัด Navigate ไว้ ลบเฉพาะไฟล์เพจใน (A) |
| `/receipts/nattaworks*`, `/nattaworks*` | App.tsx:482–485 | ร้าน `nattaworks` ยังมีอยู่ในฐานข้อมูล (`supabase/migrations/...806fa.sql:8,294`) — URL เก่าอาจถูกบุ๊กมาร์กไว้ ปล่อยให้ตกกลับ `/receipts` ปลอดภัยกว่า 404 |
| `/quick-doc` | App.tsx:317 | มีการ์ดลิงก์ใน `src/film-shop/components/tools/FilmAppLinksPage.tsx:26` (ชี้ปลายทางใหม่แล้ว) แต่บุ๊กมาร์กเก่ายังอาจใช้ |

หมายเหตุ: redirect เหล่านี้เป็น one-liner `<Navigate>` ทั้งหมด ต้นทุน bundle ~0 การลบให้ประโยชน์น้อยมากเมื่อเทียบกับความเสี่ยง 404

---

## (C) ห้ามลบ — callback / entry / print / share / integration ที่ระบบจริงใช้อยู่

- `/auth/line/callback` (App.tsx:270) และ `/l/link`, `/l/shop` (326–327) — LINE Login / LIFF entry
- `/launch` (App.tsx:339) — เป็น `start_url` ของ **PWA ทั้ง 6 ตัว** (`public/manifest-{admin,customer,film-shop,pos,receipts,staff}.webmanifest`) ลบแล้วแอปที่ติดตั้งไว้จะเปิดไม่ขึ้น
- `/po/:token` (App.tsx:371) — ลิงก์รีวิวใบสั่งซื้อสาธารณะที่ส่งให้ลูกค้าทาง LINE
- `/fs/:token` (App.tsx:488) — share link แลกโทเคนเป็นเซสชัน (`src/pages/admin/FsShareLinks.tsx` เป็นตัวสร้าง)
- `/film-intake` (App.tsx:490) — ฟอร์มรับงานจากกลุ่ม LINE ใช้โทเคนในลิงก์เป็นสิทธิ์เข้าใช้
- `/receipts/:storeSlug/documents/:id/print` และ `/print-preview` (App.tsx:478–480), `/pos/receipt/:id` (476), `/pos/purchase-orders/:id/print` (475) — flow พิมพ์จริง เปิดเป็นหน้าต่างใหม่
- `/verify-line`, `/me/line-status` (432–433), `/join-store`, `/accept-admin`, `/.lovable/oauth/consent` (277–279) — invite/consent entry
- `/faq/line-oa` (App.tsx:289) — แม้จะถูกปิดด้วย `LINE_OA_UI` แต่ยังอยู่ใน `public/sitemap.xml:24` และ e2e `seo-titles-descriptions.spec.ts:58` และมี canonical ใน `src/pages/FaqLineOa.tsx:105` → ถ้าจะลบ ต้องถอดออกจาก sitemap + test พร้อมกัน
- `/dev/print-harness` (App.tsx:286) — ดูเหมือน dev route แต่ `tests/e2e/receipt-10x7-print-settings.spec.ts:3` ใช้เป็น harness ทดสอบการพิมพ์
- `/diagnostics`, `/diagnostics/routes` (341–342) — `tests/e2e/diagnostics-routes-audit.spec.ts` และ `routeRegistry.NAV_ENTRIES` อ้างถึง; ใช้ซัพพอร์ตเวลาเว็บค้าง
- `/account/line-debug` (302) — หน้าดีบักตอนเชื่อม LINE ไม่ผ่าน (มี SeoHead ระบุ path)

---

## ลำดับที่แนะนำถ้าจะเดินหน้าลบ

1. แก้ Edge Functions ให้เลิกใช้ `/receipts/film` และ `/admin/orders/<id>` ก่อน (7 จุดข้างบน) แล้วค่อยพิจารณาลบ redirect
2. ลบไฟล์กำพร้าในกลุ่ม (A) รอบแรก — ไม่กระทบ router เลย
3. ลบกลุ่ม LINE OA UI + ops menus พร้อมถอดธงใน `legacyUi.ts` และอัปเดต `routeRegistry.ts` + เทสต์ 3 ไฟล์ในรอบเดียว (แยกรอบจะทำให้เทสต์แดง)
4. คงกลุ่ม (B) เป็น `<Navigate>` ไว้ตลอด และห้ามแตะกลุ่ม (C)

ยังไม่ได้แก้ไฟล์ใด ๆ — รออนุมัติก่อนลงมือ
