-- No-op migration (เดิมเป็นสคริปต์ล้างข้อมูลทดสอบ QA แบบ hard-code order_no)
-- QA cleanup ได้ทำไปแล้วเฉพาะ environment เดิม จึงเปลี่ยนไฟล์นี้เป็น no-op
-- เพื่อไม่ให้ลบข้อมูลจริงเมื่อรัน migration ใน environment อื่น
-- ห้ามเพิ่มคำสั่ง DELETE/UPDATE ข้อมูลใด ๆ ในไฟล์นี้ และห้ามสร้าง migration เพื่อล้างข้อมูลทดสอบอีก
SELECT 1;
