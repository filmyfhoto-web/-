# แผน: E2E ทางลัด 5 ใบ, a11y ของ drawer/rail, Skeleton/Empty state และการจำสถานะเมนู

ขอบเขต: เฉพาะหน้า FILM SHOP Dashboard (`/admin/home`), Sidebar/drawer และชุดเทสต์
ไม่แตะ: เอกสาร 2 ร้าน, POS engine, queue/run-work, group bot/LINE backend, auth/role, DB schema

## 1) E2E ทางลัด 5 ใบ ทุก viewport
สเปกใหม่ `tests/e2e/filmshop-dashboard-shortcuts.spec.ts`
- วนทดสอบ 4 ความกว้าง: 1536x864, 1024x768, 768x1024, 390x844 และเพิ่มโหมด landscape ของแท็บเล็ต/มือถือ (1024x768, 844x390)
- ตรวจ **เลย์เอาต์**: จำนวนคอลัมน์ของ `film-dash-shortcuts` (5 คอลัมน์ที่กว้าง >= 1280, 3 คอลัมน์ที่ 768-1279, 2 คอลัมน์ที่ < 768), hero เป็น 2x2 บนมือถือและ 4 ช่องบนจอใหญ่, การ์ดล่าง stack บนมือถือ, ไม่มี horizontal overflow (`scrollWidth <= clientWidth`)
- ตรวจ **เส้นทาง**: คลิกทีละใบ (`fs-quick-nav-new|pos|stock|today|customers`) แล้ว assert หน้าปลายทางที่ render จริง (คิวงาน / POS / สต๊อก / คิวงาน / ลูกค้า) แล้วกลับหน้าหลัก
- ตรวจ **สถานะข้อมูล**: เคสมีข้อมูล และเคสไม่มีข้อมูล (mock ผลลัพธ์ว่างด้วย `page.route`) ต้องยังคลิกได้และไม่ error
- เพิ่ม project `tablet-chromium` / `mobile-chromium` ให้ match สเปกนี้ใน `playwright.config.ts`

## 2) Accessibility ของ drawer / icon rail
แก้ `src/film-shop/components/layout/Sidebar.tsx` (และ `MobileNav.tsx` ถ้าใช้รูปแบบเดียวกัน)
- โหมด drawer: `role="dialog"` + `aria-modal="true"` + `aria-label="เมนูหลัก"`
- **Focus trap** ขณะเปิด drawer (วนโฟกัสด้วย Tab / Shift+Tab ภายในเมนู) และคืนโฟกัสกลับปุ่มเปิดเมื่อปิด
- **ปุ่มปิดชัดเจน**: ปุ่มกากบาทบนหัว drawer พร้อม `aria-label="ปิดเมนู"` (แยกจากปุ่ม toggle เดิม)
- **Esc ปิด drawer**, คลิก overlay ปิดได้ (มีอยู่แล้ว), ล็อกสกรอลล์พื้นหลังขณะเปิด
- โหมด rail: ทุกปุ่มไอคอนมี `aria-label` + tooltip, ลูกศรขึ้น/ลงเลื่อนรายการเมนูได้, คง `aria-current="page"` เดิม
- เพิ่มเทสต์ a11y: เปิดด้วยคีย์บอร์ด, Tab วนอยู่ใน drawer, Esc ปิด, โฟกัสกลับปุ่มเดิม

## 3) Skeleton และ Empty state ชุดดีไซน์เดียวกัน
- เพิ่มคอมโพเนนต์ร่วม `src/film-shop/components/dashboard/DashboardSkeleton.tsx`: `HeroSkeleton`, `ShortcutSkeleton`, `PanelSkeleton`, `EmptyState` (ไอคอน + ข้อความไทย + ปุ่ม action จริง) ใช้สไตล์ NATTA GROUP เดิม (radius 14-18, border #E7EAF2, shimmer ม่วงจาง)
- `FilmShopDashboard.tsx`: ขณะ `loading` แสดง skeleton แทนเลข `—` ทั้ง hero, การ์ดงานใหม่วันนี้, sparkline และการ์ดล่าง (งานล่าสุด / สรุปวันนี้)
- เมื่อโหลดเสร็จแต่ไม่มีข้อมูลจริง: ใช้ `EmptyState` ("ยังไม่มีงานในระบบ" + ปุ่ม "สร้างออเดอร์ใหม่") แทน `FALLBACK_ROWS` ที่เป็นข้อมูลตัวอย่าง และ donut แสดงสถานะว่างแบบสุภาพ
- ปรับ skeleton ให้ตรง breakpoint มือถือ/แท็บเล็ต (hero 2x2, ทางลัด 2 คอลัมน์, การ์ดล่าง stack)

## 4) จำสถานะยุบ/กางของ sidebar
- เก็บสถานะยุบ/กางของ rail ใน `localStorage` คีย์ `filmshop.sidebar.collapsed` ผ่าน hook `useSidebarPreference`
- คงสถานะข้ามการสลับ route และการรีเฟรชหน้า
- UX: **overlay drawer บนแท็บเล็ต/มือถือจะไม่จำสถานะเปิด** (เปิดหน้าใหม่ต้องไม่เจอ drawer ค้างทับเนื้อหา) จำเฉพาะโหมด rail/full และปิด drawer อัตโนมัติเมื่อเปลี่ยนหน้า
- อ่านค่าแบบ SSR-safe และครอบ try/catch กันกรณี storage ถูกบล็อก

## รายละเอียดทางเทคนิค
ไฟล์ที่จะเพิ่ม/แก้
- เพิ่ม: `tests/e2e/filmshop-dashboard-shortcuts.spec.ts`, `tests/e2e/filmshop-sidebar-a11y.spec.ts`, `src/film-shop/components/dashboard/DashboardSkeleton.tsx`, `src/film-shop/hooks/useSidebarPreference.ts`
- แก้: `src/film-shop/components/layout/Sidebar.tsx`, `src/film-shop/components/dashboard/FilmShopDashboard.tsx`, `src/film-shop/FilmShopApp.tsx` (ส่ง preference), `playwright.config.ts`, unit test ที่อ้างข้อความเดิม

QA ก่อนจบ
- typecheck (`tsgo`) และ `vite build`
- Vitest ชุดที่เกี่ยวข้อง (dashboard / layout / contract tests)
- Playwright สเปกใหม่ครบ 4 viewport รวม landscape
- ไม่ publish / deploy