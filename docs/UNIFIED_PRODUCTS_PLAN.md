# แผนรวมระบบสินค้า 2 ร้านในฐานข้อมูลเดียว (Unified Product System)

เป้าหมาย: ใช้ตาราง `products` กลางเดียว แชร์รหัส/บาร์โค้ด/รูปภาพ/ราคาทุน
ระหว่าง "ร้านนัฐภรณ์ คัลเลอร์แล็ป" และ "ร้านนัฐภรณ์ การพิมพ์" — ผูกความสัมพันธ์
ผ่านตาราง `product_shops` (many-to-many) เพื่อระบุว่าสินค้าใดวางขายในร้านใด

## Phase 0 — Database schema (เสร็จแล้ว ✅)

- `product_shops (product_id uuid, store_id uuid, override_price numeric, override_stock int, PRIMARY KEY (product_id, store_id))`
- View `product_shops_view` รวม `products + product_shops + rds_stores`
- RPC `admin_set_product_shops(p_product_id, p_store_ids[])` — replace ทั้งชุดแบบ atomic
- RLS: `product_shops_public_read` (SELECT public), `product_shops_staff_all` (ALL authenticated/admin)

## Phase 1 — UI Admin (ทำในเทิร์นนี้ ✅)

- `src/pages/admin/Products.tsx`
  - โหลด `rds_stores` + `product_shops` ตอน mount
  - Checkbox 2 ร้านในกล่อง dialog (default: ทั้งสอง)
  - บันทึก → call `admin_set_product_shops`
  - Filter dropdown "ทุกร้าน / คัลเลอร์แล็ป / การพิมพ์"
  - Badge แสดงร้านที่สินค้านั้นวางขาย
  - Realtime subscribe `product_shops`
  - ปุ่มลบ confirm 2 ชั้น

## Phase 2 — UI Receipt master pages (รอทำ)

ไฟล์: `src/pages/receipts/master/ProductsList.tsx`
(หน้าจัดการสินค้าฝั่งรายร้าน) — ให้ filter เฉพาะสินค้าที่ผูกกับ `current_shop_id`
โดยเรียกผ่าน `product_shops_view`

## Phase 3 — Storefront (รอทำ)

ไฟล์: `src/pages/Shop.tsx`
- เปลี่ยน query หลักจาก `products` → `product_shops_view` filter `store_id = currentShop`
- ราคา/สต๊อกใช้ `coalesce(override_price, standard_price)` / `coalesce(override_stock, stock)`

## Phase 4 — RLS audit (ดูสรุปด้านล่าง)

## Phase 5 — Data migration ของเก่า (รอทำ)

- ปัจจุบัน `products` ถูกล้างไปแล้ว 944 รายการ → ไม่ต้อง back-fill `product_shops`
- สินค้าใหม่ทุกชิ้นจะถูก attach ผ่าน UI Phase 1

## Phase 6 — Test + QA

- ตาม `docs/MOBILE_QA_CHECKLIST.md` หมวด F
- เพิ่ม Playwright: สร้างสินค้า → เลือก 1 ร้าน → ตรวจอีกร้านไม่เห็น

---

## ลำดับงาน (Impact map)

| ลำดับ | ไฟล์ | สถานะ |
|------|------|--------|
| 1 | migration `product_shops` + RPC | ✅ |
| 2 | `src/pages/admin/Products.tsx` | ✅ |
| 3 | `src/components/admin/SyncStatusCard.tsx` (ปรับคำนวณรวม shops) | 🟡 |
| 4 | `src/pages/receipts/master/ProductsList.tsx` | ⏳ |
| 5 | `src/pages/Shop.tsx` (customer storefront) | ⏳ |
| 6 | `src/pages/admin/ProductCsvImportDialog.tsx` (เพิ่มคอลัมน์ `shops`) | ⏳ |
| 7 | E2E tests `tests/e2e/multi-shop-isolation.spec.ts` | ⏳ |

## สรุป RLS Audit (อ้างอิง pg_policies, มิ.ย. 2026)

| Table | Policy | Roles | Notes |
|-------|--------|-------|-------|
| `products` | staff_any read | authenticated | OK — customer ดูผ่าน view/RPC, ไม่ใช่ table ตรง |
| `products` | editor insert/update | authenticated (`is_staff()`) | OK |
| `products` | admin delete | authenticated (`is_admin()`) | OK |
| `product_shops` | public_read | public | ✅ ใช้สำหรับ storefront filter |
| `product_shops` | staff_all | authenticated (`is_staff()`) | ✅ ครอบ insert/update/delete |
| `product_costs` | admin manage / staff read | authenticated | ❗ลูกค้าไม่เห็น cost — OK |
| `product_images` | staff insert/update + public read | mixed | OK |

### ที่ต้องตรวจสอบเพิ่มก่อนปล่อย production

1. `Shop.tsx` query ปัจจุบันเรียก `products` ตรง — ลูกค้าไม่ใช่ staff → ต้องเปลี่ยนเป็น RPC `public_products_for_shop(p_store_id)` หรือ view `public.shop_products_view` (ที่ filter `active = true` + join `product_shops`)
2. ตรวจว่า `is_staff()` รวม role `'staff'` และ `'owner'/'admin'` ทั้งหมด
3. ลูกค้าไม่ควรเห็น `cost_price`, `internal_sale_type`, `low_stock_threshold` — ใช้ view คัด column
4. Storage bucket `product-images` — public READ, write โดย authenticated เท่านั้น (ยืนยันแล้ว)

---

## Rollback Plan

หากเกิดปัญหา:

1. UI: `git revert` commit Phase 1
2. DB: `DROP TABLE product_shops CASCADE; DROP FUNCTION admin_set_product_shops;` — ข้อมูล `products` ไม่กระทบ
3. แจ้ง user ภายใน 5 นาทีหลัง deploy