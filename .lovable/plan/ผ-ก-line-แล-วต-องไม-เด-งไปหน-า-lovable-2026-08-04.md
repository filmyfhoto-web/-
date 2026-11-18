# ผูก LINE แล้วต้องไม่เด้งไปหน้า Lovable

## ปัญหาที่ผู้ใช้เจอ
เปิด `https://filmyynatta.com/shop?app=customer` แล้วกดเข้าสู่ระบบ/ผูกบัญชี LINE
พอกลับจาก LINE กลับไปโผล่ที่โดเมน Lovable (`*.lovable.app`) ซึ่งมีหน้ากั้นให้ล็อกอิน Lovable
แทนที่จะกลับเข้าหน้าร้านบนโดเมนจริงทันที

## สาเหตุที่ต้องยืนยันก่อนแก้ (ขั้นแรกของงาน)
ยังยืนยันไม่ได้ 100% ว่า "โดเมน Lovable" มาจากทางไหน มี 2 ทางที่เป็นไปได้ และจะตรวจทั้งคู่ก่อน:

1. Endpoint URL ของ LIFF / Callback URL ใน LINE Console ยังชี้ไปที่
   `www-filmyynatta-com.lovable.app` — ทำให้ LINE พากลับไปโดเมนนั้นเสมอ
   (ตรวจได้จากหน้า `/admin/line-summary` และตัวตรวจ `line-liff-check` ที่มีอยู่แล้ว)
2. ผู้ใช้เริ่มล็อกอินจากแท็บ/ไอคอนที่เปิดอยู่บนโดเมน Lovable อยู่ก่อนแล้ว
   ระบบจะจำ origin นั้นไว้ตอนเริ่ม OAuth แล้วพากลับที่เดิม

## สิ่งที่จะทำ

### 1. บังคับโดเมนจริงตั้งแต่ต้นทาง (แก้ได้ในโค้ด ครอบทั้ง 2 สาเหตุ)
- เพิ่มตัวกันโดเมนใน `src/lib/hostMode.ts` + จุดบูตแอป: ถ้าเปิดหน้าฝั่งลูกค้าบนโฮสต์
  `*.lovable.app` / `*.lovableproject.com` ในโหมด production และไม่ได้อยู่ใน iframe พรีวิว
  ให้ย้าย (`location.replace`) ไปที่ path เดิมบน `https://filmyynatta.com` ทันที
  — พรีวิวใน editor และ localhost ไม่ถูกกระทบ
- ตอนเริ่ม LINE login/ผูกบัญชี ให้ส่ง origin เป็นโดเมนสาธารณะเสมอ
  (ใช้ `PUBLIC_ORIGIN` แทน `window.location.origin` เมื่อ origin ปัจจุบันไม่ใช่โดเมนสาธารณะ)
  เพื่อให้ปลายทางหลังผูก LINE กลับมาที่ร้านจริง

### 2. กลับเข้าระบบทันทีหลังผูก LINE
- ตรวจปลายทางหลังผูกสำเร็จให้กลับไปหน้าเดิมที่ผู้ใช้กำลังใช้ (`next`, ค่าเริ่มต้น `/shop`)
  โดยไม่ต้องกดซ้ำ และไม่ผ่านหน้ากลางที่ทำให้หลุด origin

### 3. เตือนเมื่อค่าใน LINE Console ยังผิด
- ถ้า `line-liff-check` พบว่า Endpoint/Callback ยังเป็นโดเมน Lovable ให้แสดงเตือนชัดเจน
  ในหน้าแอดมิน LINE พร้อมค่าที่ถูกต้องให้คัดลอกไปวางใน LINE Console
  (ค่าที่ Console ต้องแก้เอง — โค้ดแก้ให้ไม่ได้ แต่จะบอกให้ครบ)

### 4. ทดสอบ
- เพิ่มยูนิตเทสต์ของตัวกันโดเมน (โฮสต์ lovable → ย้ายไปโดเมนจริง, พรีวิว/iframe/localhost → ไม่ย้าย)
- เทสต์ว่า origin ที่ส่งให้ LINE OAuth เป็นโดเมนสาธารณะเสมอ
- รัน `bunx vitest run` + typecheck ให้ผ่านทั้งหมด

## รายละเอียดทางเทคนิค
- ไฟล์หลัก: `src/lib/hostMode.ts` (เพิ่ม `canonicalCustomerRedirect`), `src/main.tsx` หรือ
  `src/components/HostRedirect.tsx` (เรียกใช้), `src/lib/lineOauth.ts` (ส่ง origin สาธารณะ),
  `src/pages/customer/LineOauthCallback.tsx` / `src/components/RequireLineLink.tsx` (ปลายทาง `next`)
- ฝั่ง edge function ไม่ต้องแก้ allow-list (โดเมนจริงอนุญาตอยู่แล้ว)
