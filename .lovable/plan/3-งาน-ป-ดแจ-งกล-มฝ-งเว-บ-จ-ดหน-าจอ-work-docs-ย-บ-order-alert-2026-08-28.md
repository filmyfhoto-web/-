# 3 งาน: ปิดแจ้งกลุ่มฝั่งเว็บ · จัดหน้าจอ work-docs · ยุบ order-alerts

## 1. ปิดแจ้งเตือนกลุ่ม LINE ของตะกร้าเว็บ

สิ่งที่ตรวจพบ: `supabase/functions/guest-order-submit/index.ts` บรรทัด ~349 ยังเรียก `notifyOrderGroups(...)` อยู่จริง ขณะที่ฝั่ง `send-order-line-notifications` ปิดไปแล้วด้วยธง `ADMIN_NOTIFY_ENABLED = false` (คงโค้ดไว้เผื่อเปิดใหม่)

จะทำแบบเดียวกัน:
- ใน `guest-order-submit/index.ts` เพิ่มค่าคงที่ `const ADMIN_GROUP_NOTIFY_ENABLED = false;` แล้วครอบบล็อก `notifyOrderGroups` ไว้ ไม่ลบโค้ด/ไม่ลบ import (คอมเมนต์อธิบายว่าใช้แชทลูกค้าแทน)
- ไม่แตะ `_shared/orderGroupNotify.ts` (ใช้ร่วมกับใบเบิกโรงเรียน / po-review / line-notify ซึ่งยังต้องทำงาน)
- ไม่แตะ customer ack, `notify_staff` (กระดิ่งในระบบ) และ `order_notification_logs`
- Deploy `guest-order-submit` แล้วยิงทดสอบทั้ง `order` และ `quote` ตรวจ log ว่าไม่มี queue เข้ากลุ่ม และออเดอร์ยังสร้างได้

## 2. หน้า /admin/work-docs ให้พอดีทุกจอ

หน้านี้ไม่ได้ใช้ตาราง HTML ในรายการหลัก (เป็นการ์ด) จุดที่ล้นจริงคือ:
- แถบหัวเรื่อง: ปุ่ม "รับงานใหม่ / จับคู่ลูกค้า & LINE / ส่งออก CSV" + แท็บ 2 ปุ่ม อยู่แถวเดียวกัน บนมือถือดันความกว้างและตัดคำแปลก
- แถวรายการ: ชื่อ+โค้ด+เวลา+สถานะ อัดในบรรทัดเดียว จอแคบจะเบียด
- `PriceEditor.tsx` มี `<table>` ใน `overflow-x-auto` — เลื่อนแนวนอนทั้งหน้าไม่ได้เกิดจากตรงนี้ แต่บนมือถือคอลัมน์ยังแคบเกินอ่าน

จะปรับ (frontend/CSS เท่านั้น ไม่แตะ logic):
- `src/pages/admin/WorkDocs.tsx`
  - หัวเรื่อง: มือถือ = ชื่อหน้าบรรทัดเดียว, ปุ่มรอง (จับคู่/CSV) ยุบเป็นปุ่มไอคอนหรือเมนูสามจุด, ปุ่มหลัก "รับงานใหม่" เต็มความกว้างบนจอเล็ก; เดสก์ท็อปคงเดิม
  - แท็บ "รอดำเนินการ/ส่งกลับแล้ว" ย้ายลงบรรทัดของตัวเองบนมือถือ (`w-full grid-cols-2`)
  - แถวรายการ: ให้สถานะขึ้นบรรทัดใหม่บนจอแคบ, บังคับ `min-w-0` + `truncate` ครบทุกชั้น, ลดขนาด avatar บนมือถือ
  - ครอบคอนเทนต์ด้วย `w-full max-w-full overflow-x-hidden` กันสาเหตุล้นจากลูก
  - แท็บเล็ต: ให้ layout 2 คอลัมน์เริ่มที่ `md:` แทน `lg:` เฉพาะเมื่อกว้างพอ (ใช้ `xl:grid-cols-[38fr_62fr]`, `md` ยังเป็นสลับหน้า) เพื่อไม่ให้คอลัมน์รายละเอียดแคบจนล้น
- `src/components/admin/work-docs/PriceEditor.tsx`: มือถือแสดงเป็นการ์ดต่อรายการ (ชื่อ/จำนวน/ราคา/รวม) เดสก์ท็อปยังเป็นตารางเดิม
- เพิ่มเทสต์ในสไตล์เดิม (`src/__tests__/`) ตรวจว่าไฟล์มี class responsive ที่ตกลงไว้ และรัน Playwright ที่ 375 / 768 / 1280 ตรวจว่า `body.scrollWidth <= viewport`

## 3. ยุบ /admin/order-alerts เข้า work-docs

ผลตรวจสอบเส้นทางปัจจุบัน:
- `src/App.tsx` บรรทัด 424: `/admin/order-alerts` **redirect ไป `/admin/work-docs?filter=order` อยู่แล้ว** — เมนูหลักไม่มีลิงก์นี้แล้ว
- ตัวที่ยังพาเข้าหน้านั้นได้จริง: `src/components/admin/AdminNotificationCenter.tsx` (ปุ่มกระดิ่ง `nav("/admin/order-alerts")` → ปลายทางถูก redirect ต่อ ใช้ได้แต่ควรชี้ตรง) และ `src/pages/admin/OrderDeepLink.tsx` ที่ **เรนเดอร์คอมโพเนนต์ `OrderAlerts` ตรง ๆ** สำหรับลิงก์ `/admin/orders/:id` ที่บอทส่งเข้ากลุ่ม LINE — นี่คือทางเข้าเดียวที่ทำให้หน้านี้ยัง "มีอยู่" ให้เจ้าของร้านเห็น
- `/admin/guest-orders` ชี้ไป `/admin/order-alerts` เมื่อ `LEGACY_OPS_MENUS` เปิด

เทียบฟังก์ชัน (มีเฉพาะใน OrderAlerts):
| ฟังก์ชัน | ตัดสิน |
| --- | --- |
| ack (อ่าน/ยืนยัน) | ซ้ำ — work-docs มี "ยืนยันรับรายการและส่งข้อความ" (customer ack) แล้ว ใช้ของ work-docs |
| ส่ง LINE ซ้ำ (`line-notify`) รายตัว/bulk | ซ้ำ — work-docs มี "ส่งข้อความอีกครั้ง" และ "ส่งไฟล์ให้ลูกค้าทาง LINE" |
| สร้างเอกสาร quotation/delivery/receipt แยก 2 ร้าน | ทับกับ PriceEditor (ยืนยันราคา → สร้าง PDF/Excel → ส่ง LINE) ที่ทำใน work-docs แล้ว — **ทิ้ง** ไม่ย้าย |
| export CSV/XLSX ทั้งชุด + ตัวกรอง/เรียง/แบ่งหน้า | work-docs มี CSV ของรายการที่กรองอยู่แล้ว — ทิ้งส่วนเกิน |
| activity timeline (`OrderDeliveryTimeline`) | **ย้าย** เป็นการ์ดพับได้ในแผงรายละเอียด work-docs (อ่านอย่างเดียว) |
| ตั้งค่าเสียง/ป๊อปอัพแจ้งเตือน | ย้ายไปอยู่ที่ `/admin/notification-settings` ซึ่งมีอยู่แล้ว |

ตาราง `notifications` (`type=new_order`): ยังถูกใช้โดย `useNewOrderAlerts` (ตัวนับกระดิ่ง), `AdminNotificationCenter`, `AlertStats`, `Inbox`, `AdminActivityFeed`, `adminNotifications.ts` — **จะไม่แตะสคีมาและไม่เปลี่ยนวิธีเขียนใด ๆ** work-docs ยังใช้ `order_notification_logs` ต่อไป และเพิ่มแค่การ mark read เมื่อกด "ได้รับเอกสารแล้ว" เพื่อให้กระดิ่งลดลงตามจริง

สิ่งที่จะทำ:
1. `OrderDeepLink.tsx`: กรณี `state === "order"` เปลี่ยนจากเรนเดอร์ `OrderAlerts` เป็น `navigate("/admin/work-docs?filter=order&id=<id>", { replace: true })` (ตัด `autoExport` ที่ไม่มีที่ใช้แล้ว หรือคง query ไว้เฉย ๆ)
2. `AdminNotificationCenter.tsx`: ปุ่มชี้ตรงไป `/admin/work-docs?filter=order`
3. `/admin/guest-orders` redirect ไป `/admin/work-docs?filter=order`
4. work-docs: ปุ่มยืนยันรับ mark `notifications.read = true` ของออเดอร์นั้น (best-effort) + เพิ่มการ์ด timeline
5. ลบ `src/pages/admin/OrderAlerts.tsx` และเทสต์ของมัน หลังยืนยันว่าไม่มี import เหลือ; ไฟล์ช่วยที่กลายเป็นกำพร้า (`orderAlertExport.ts`, `orderAlertFilters.ts`, `orderAlertPrefs.ts`, `AlertStats.tsx`) จะรายงานรายชื่อและลบเฉพาะตัวที่ไม่มีผู้ใช้เหลือจริง (หมายเหตุ: `orderAlertPrefs` ถูกใช้โดย `useNewOrderAlerts` → เก็บไว้)
6. อัปเดต `routeRegistry.ts` และเทสต์ deep link ที่เกี่ยวข้อง

## ความเสี่ยง
- ปิดกลุ่ม: ถ้าร้านยังพึ่งกลุ่มอยู่จะเงียบทันที — แก้ด้วยธงเปิดกลับได้ในบรรทัดเดียว
- Deep link จาก LINE: ต้องคง `/admin/orders/:id` ให้ทำงาน (แค่เปลี่ยนปลายทางเป็น work-docs) มีเทสต์ `admin-order-deeplink.test.ts` คุมอยู่
- ลบไฟล์กำพร้า อาจกระทบเทสต์เดิม → รันชุดเทสต์เต็มและแก้เทสต์ที่อ้างถึงหน้าเก่า

## ลำดับงาน
ข้อ 1 → ข้อ 2 → ข้อ 3 (ข้อ 3 แตะหลายไฟล์ ทำท้ายสุดแล้วรันเทสต์รวดเดียว)
