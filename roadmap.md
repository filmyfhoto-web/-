- [x] Add LINE mini-app shell and routes under `/line`
- [x] Add home, order entry, and tracking screens using existing catalog/cart/order flows
- [x] Verify build and preview route behavior
- [x] Remove the customer home “สั่งซื้อสินค้า” shortcut card
- [ ] Configure/verify LIFF destination and LINE authentication path for the live NATTA GROUP site
- [ ] Centralize the navy theme tokens and align top navigation contrast in light/dark modes
- [ ] Add a real NATTA GROUP contact page and link it from customer navigation
- [x] Balance the selected customer account page layout and responsive spacing
- [x] Make the account page frame consistent and uncluttered on both phone and desktop widths
- [x] Balance shared customer pages (shop, cart, my orders) with the account page frame on mobile and desktop
- [x] Balance admin and Work & Documents page frames so desktop does not feel oversized versus mobile
- [x] Balance POS page frame and spacing with the account page direction
- [x] Add a real contact page that submits messages to the store
- [x] Point LIFF destination to the real NATTA GROUP landing page instead of the product page
- [x] Film Shop receipts-only intake: remove job-order UI, add customer address/organization, limit payment methods, and add Smart Import paste
- [ ] ปิด Film Shop เป็น Receipt Only: ซ่อนเมนู/ปุ่ม/บอทใบสั่งจ้างและตัดการซิงก์เก่า
- [ ] ปรับ Q รันงานและใบเสร็จให้ใช้ข้อมูลชุดเดียวกัน พร้อมตรวจการบันทึกจริง

## ม่วงจดให้ (Film Shop LINE assistant) — กำลังทำ
- [x] เพิ่มคอลัมน์ evidence + index (migration 0007)
- [x] รูป Rich Menu ใหม่ (richmenu/richmenu-muang.jpg)
- [ ] parser/flex/handler: ยืนยันก่อนบันทึก, แนบหลักฐาน, แก้/ยกเลิกล่าสุด, มัดจำ, ค้างรับ
- [ ] webhook จำกัดช่อง natta + postback + รูป/ไฟล์
- [ ] Rich Menu 8 ปุ่ม, UI/ตั้งค่า/หน้าบัญชี rebrand + หลักฐาน
- [ ] เทสต์ / build / deploy

## ม่วงจดให้ — Phase 1 (A–I)
- [x] A เปลี่ยนชื่อแบรนด์ที่ผู้ใช้เห็น (parser คงคำเรียกเดิม)
- [x] B/D ยืนยันก่อนบันทึก + การ์ดรีวิว + เขียนครั้งเดียวตอนยืนยัน
- [x] C migration 0007 เพิ่มคอลัมน์ evidence (ใช้กับฐานข้อมูลจริงแล้ว)
- [x] E รายการล่าสุด = วันนี้ (เวลาไทย) + ผู้ใช้เดียวกัน + ไม่ถูกยกเลิก
- [x] F เหตุผลยกเลิก "ยกเลิกผ่าน LINE (ม่วงจดให้)"
- [x] G แก้ไขล่าสุด / แก้รายละเอียดล่าสุด (ต้องยืนยัน)
- [x] H มัดจำเป็นร่างรอยืนยัน + ตรวจยอดคงค้างซ้ำ + กันเขียนซ้ำ
- [x] I เทสต์ 27 เคส + typecheck

## ม่วงจดให้ — ปิดช่องว่างที่เหลือ (เสร็จ)
- [x] รูป/ไฟล์ในช่อง natta ถูกผู้ช่วยรับทุกกรณี ไม่หลุดไป intake อื่น
- [x] เมนูลัด 8 ปุ่มตรงตามรูป (4x2)
- [x] แนบหลักฐานเพิ่มให้รายการล่าสุด ต้องยืนยันก่อนบันทึก
- [x] ฟังก์ชันเปิดหลักฐานแบบปลอดภัย + ปุ่ม "ดูหลักฐาน" ในหน้าบัญชี
- [x] เทสต์/typecheck/security/build/deploy
