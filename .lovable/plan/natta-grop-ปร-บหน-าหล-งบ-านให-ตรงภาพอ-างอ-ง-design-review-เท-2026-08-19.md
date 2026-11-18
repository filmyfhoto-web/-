# NATTA GROP — ปรับหน้าหลังบ้านให้ตรงภาพอ้างอิง (Design Review เท่านั้น)

## A) โครงสร้างปัจจุบันที่ตรวจแล้ว

- เมนูเดียวกลาง: `src/lib/adminNav.ts` — `APP_NAME = "NATTA GROP"`, `DASHBOARD_NAV` 8 รายการตรงกับภาพ (แดชบอร์ด / POS หน้าร้าน / ลูกค้า / สต๊อกสินค้า / เอกสาร 2 ร้าน / ระบบกลุ่มบอท / รันงาน / ตั้งค่า) และ `STOCK_TABS` 6 แท็บ (สินค้า / สต๊อก / ราคา / จัดซื้อ / ผู้จำหน่าย / ประวัติ)
- Dashboard shell: `src/components/layout/DashboardShell.tsx` — sidebar กรมท่า `w-64` + header ด้านบน + drawer มือถือ
- แดชบอร์ด: `src/pages/admin/AdminHome.tsx` — metric cards 4 ใบ (ยอดขายวันนี้ / ออเดอร์วันนี้ / งานค้าง / สินค้าใกล้หมด), ภาพรวมงาน 5 สถานะ, ออเดอร์ล่าสุด, สินค้าใกล้หมด — ข้อมูลจริงจาก DB + realtime
- Workspace shell: `src/components/layout/AdminLayout.tsx` — header บาง + ปุ่ม “กลับหน้าหลัก” + stock tabs อัตโนมัติเมื่ออยู่ route สต๊อก
- สต๊อก: `/admin/inventory` redirect ไป `/admin/products`; `Products.tsx` มี search + หมวดหมู่ + สถานะ + คอลัมน์ “คงเหลือ” แล้ว
- POS: `PosShell.tsx` (top bar + nav ซ้าย) และ `CentralPOS.tsx` (กริดสินค้า + ตะกร้า + ส่วนลด + ปุ่มชำระเงิน)
- ธีม: `src/index.css` มี token ม่วงอยู่แล้ว (`--brand #7C3AED`, `--brand-deep`, `--brand-bright`, `--brand-lavender`, `--brand-ink`) แต่ `--primary` ของหลังบ้านยังเป็นฟ้า และ `.admin-sidebar` ยังไม่ใช่ navy #0B1E32 ตามภาพ

## B) มีอยู่แล้ว vs ยังต่างจากภาพ

มีอยู่แล้ว (ไม่ต้องสร้างใหม่)
1. โครงเมนู 8 รายการ + หลัก 1 งาน 1 ทางเข้า
2. Dashboard sidebar + metric cards + ตารางออเดอร์ + list สินค้าใกล้หมด (ข้อมูลจริง)
3. Stock tabs 6 แท็บ + ปุ่มเพิ่มสินค้า / นำเข้า + ฟิลเตอร์ครบ
4. POS: top bar, หมวดหมู่, กริดสินค้า, ตะกร้า, ส่วนลด, ปุ่มชำระเงิน, พักบิล, ประวัติการขาย

ยังต่างจากภาพ (งานที่ต้องทำ)
1. สี: sidebar ยังไม่ใช่ navy เข้ม #0B1E32; active item ยังไม่เป็น purple gradient; ปุ่มหลัก/ปุ่มชำระเงินยังเป็นฟ้าไม่ใช่ม่วง
2. Density: การ์ด/ตารางยัง padding หลวมกว่าภาพ (ภาพ: ขอบบาง 1px สีจาง, shadow เบามาก, radius กลาง ~10-12px, แถวตารางกระชับ)
3. Dashboard: metric cards ยังไม่มี icon-in-tinted-square + accent bar ตามภาพ; “ภาพรวมงาน” ยังไม่ใช่ status card แถวเดียวแบบภาพ
4. Stock: top bar ยังไม่รวม “+ เพิ่มสินค้า / นำเข้า / เมนูเพิ่มเติม” ไว้บน header เดียว (ปุ่มกระจายอยู่ในเนื้อหน้า); แถวฟิลเตอร์ยังไม่จัดเป็นแถบเดียวสีขาวเต็มความกว้าง
5. POS: top bar ยังไม่มี online dot ตรงกลางคู่ชื่อ และปุ่มขวายังไม่จัดกลุ่ม พักบิล/ประวัติการขาย/ตั้งค่า ให้เท่ากันแบบภาพ; แถบหมวดหมู่ซ้ายยังไม่ใช่คอลัมน์ถาวรบน desktop
6. Responsive: ต้องตรวจซ้ำที่ 1440 / 1024 / 390 หลังปรับ density

## C) Final visual spec

โทนกลาง
- Navy sidebar `#0B1E32`; active = gradient ม่วง `#7C3AED → #A855F7`, ตัวอักษรขาว, radius 10px
- Canvas `#F7F8FA`, การ์ดขาว, border `1px rgba(15,23,42,.08)`, shadow `0 1px 2px rgba(16,24,40,.06)`
- Radius: การ์ด 12px, ปุ่ม/อินพุต 10px
- Spacing: หน้า padding 20-24px, ช่องไฟการ์ด 16px, แถวตารางสูง 44-48px, ฟอนต์ไทย 13-14px, หัวข้อ 15-16px bold

1. Dashboard (`/admin/home`)
- Sidebar 248-256px คงที่, โลโก้บนสุด + “NATTA GROP / ระบบบริหารธุรกิจครบวงจร”, เมนู 8 รายการ icon 16px, ล่างสุด user + ออกจากระบบ
- Content: หัวข้อ + ปุ่มรีเฟรช, metric cards 4 ใบ grid 4/2/1 คอลัมน์ (1440/tablet/390) แต่ละใบ = label เล็กสีเทา, ตัวเลขใหญ่ 24-28px, icon ในสี่เหลี่ยม tint ตามโทน, คลิกได้ทั้งใบ
- ภาพรวมงาน: การ์ดเดียว ภายในเป็น status chips 5 ช่องเรียงแถว (รอรับงาน/กำลังดำเนินการ/รอชำระเงิน/เสร็จสิ้น/ยกเลิก) → mobile 2 คอลัมน์
- ออเดอร์ล่าสุด: ตาราง 5 คอลัมน์ (เลขที่/ลูกค้า/สถานะ badge/ยอด/เวลา) แถวคลิกเปิด sheet เดิม; mobile = card list
- สินค้าใกล้หมด: list กระชับ ชื่อ + คงเหลือสีเตือน + ลิงก์ไปสต๊อก

2. สต๊อกสินค้า (`/admin/inventory` → `/admin/products`)
- Full screen ไม่มี sidebar: header 56px = ซ้าย “← กลับหน้าหลัก” + ชื่อหน้า, ขวา `+ เพิ่มสินค้า` (ม่วง) / `นำเข้า` (outline) / `⋯` (เมนู: ประวัตินำเข้า, ส่งออก, เครื่องมืออื่น)
- แถบแท็บ 6 แท็บใต้ header, active = ขีดล่างม่วง
- แถบฟิลเตอร์การ์ดขาวเต็มความกว้าง: search (flex-1) + หมวดหมู่ + สถานะ + ปุ่มกรอง
- ตาราง 8 คอลัมน์: รหัส / ชื่อ / หมวดหมู่ / คงเหลือ / หน่วย / ราคาขาย / สถานะ / จัดการ; หัวตารางเทาอ่อน sticky, คงเหลือชิดขวา, 0 = แดง, ต่ำกว่าจุดเตือน = ส้ม; mobile = card list เดิม

3. POS (`/pos`)
- Top bar navy: ซ้าย “← กลับหน้าหลัก”, กลาง “POS หน้าร้าน” + จุดเขียว online, ขวา พักบิล / ประวัติการขาย / ตั้งค่า
- Layout desktop: หมวดหมู่ซ้าย 180-200px (รายการแนวตั้ง active ม่วงอ่อน) | กริดสินค้ากลาง 4-5 คอลัมน์ (ภาพ 1:1 + ชื่อ 2 บรรทัด + ราคาม่วง) | ตะกร้าขวา 360-420px
- ตะกร้า: รายการ + ปุ่ม +/- ขนาดนิ้วสัมผัส (≥40px), ส่วนลด, รวมทั้งหมดตัวใหญ่, ปุ่มชำระเงินม่วงเต็มความกว้าง สูง 56px
- Tablet: ตะกร้าย่อเป็น drawer; Mobile 390: หมวดหมู่เป็นแถบ scroll แนวนอน, กริด 2 คอลัมน์, ตะกร้าเป็น bottom sheet — ทุกอย่างใช้ flow เดิม

## D) ไฟล์ที่คาดว่าจะแก้เมื่ออนุมัติ (ยังไม่แก้ตอนนี้)

- `src/index.css` — token navy/purple, คลาส `.admin-sidebar`, `.admin-nav-item-active`, utility การ์ด/ตาราง
- `tailwind.config.ts` — map สีที่เพิ่ม (ถ้าจำเป็น)
- `src/components/layout/DashboardShell.tsx` — สี sidebar, density, active state
- `src/components/layout/AdminLayout.tsx` — header actions slot + แถบแท็บสต๊อก
- `src/pages/admin/AdminHome.tsx` — presentation ของ metric cards / status cards / ตาราง (คง query เดิม)
- `src/pages/admin/Products.tsx` — ย้ายปุ่มขึ้น header, จัดแถบฟิลเตอร์, จัดคอลัมน์ตาราง 8 ช่อง
- `src/components/layout/PosShell.tsx` และ `src/pages/pos/CentralPOS.tsx` — top bar, คอลัมน์หมวดหมู่, การ์ดสินค้า, ตะกร้า/ปุ่มชำระเงิน (presentation เท่านั้น)
- อาจแตะเบา ๆ: `src/pages/admin/Stock.tsx`, `Prices.tsx`, `Purchases.tsx`, `Suppliers.tsx` เพื่อให้ตาราง/การ์ดใช้สไตล์เดียวกัน

## E) จุดที่ล็อก ห้ามแตะ logic

- auth / role permissions / route guards (`RequireStaff*`) — เปลี่ยนเฉพาะการแสดงผล
- POS checkout, hotkeys, สแกนบาร์โค้ด, พักบิล, การพิมพ์ใบเสร็จ (`posCheckout.ts`, `parkedBills.ts`, print surface)
- Stock source-of-truth: `stock_movements`, `stock_sync_outbox`, RPC/trigger ทั้งหมด
- เอกสาร 2 ร้าน `/receipts` และลูก, Q/รันงาน/queue/job-processing/delivery
- group bot / LINE webhook / commands / notification tables และ edge functions
- ไม่นำ LINE OA inbox / notification UI ที่ตัดออกแล้วกลับมา
- ไม่เพิ่มเมนูซ้ำ ไม่เพิ่มปุ่มที่ไม่มี action จริง ไม่ใส่ตัวเลข mock
- แบรนด์หลังบ้าน = `NATTA GROP` เท่านั้น (landing สาธารณะยังคง NATTA GROUP)

## การตรวจก่อนส่ง (ตอน implement)
1440 / 1024 / 390 ไม่มี horizontal overflow, ทุกปุ่มมี action จริง, unit tests เดิมผ่านทั้งหมด
