# วินิจฉัย LINE Login ถูกปฏิเสธบน production (อ่านอย่างเดียว ยังไม่แก้อะไร)

## สรุปสั้น
- **ถูกปฏิเสธที่ขั้น "หน้า LINE" (authorize) ไม่ใช่ที่ระบบเรา** — ทุกครั้งที่ผู้ใช้กดเข้าสู่ระบบ ระบบเราออก authorize_url สำเร็จ แต่ LINE **ไม่เคย redirect กลับ** มาที่ callback เลย
- **ไม่มี error code จากฝั่งเรา** เพราะ callback ไม่เคยถูกเรียกจากเครื่องผู้ใช้จริง
- สาเหตุที่เป็นไปได้มากที่สุด: Callback URL ที่กรอกใน LINE Developers **ไม่ได้อยู่ใน LINE Login channel ตัวเดียวกับ `LINE_LOGIN_CHANNEL_ID` ที่ระบบใช้** (หรือกรอกไว้ใน Messaging API channel / อีก channel หนึ่ง / ยังไม่กด Update)

## หลักฐานที่ตรวจได้ (production, 19 ส.ค. 2026)
- `line-oauth-start` ทำงานปกติ: `start_requested → state_created → authorize_url_issued` ครบทุกครั้ง ล่าสุด 09:06:47Z (IP ผู้ใช้ 171.97.207.215, ทั้ง Chrome/Windows และ iPhone)
- `redirect_uri` ที่ออกจริง ตรงเป๊ะ: `https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/line-oauth-callback` (เหมือนกับตอนที่ล็อกอินเคยสำเร็จเมื่อ 8 ส.ค.)
- `line_oauth_states`: 12 แถวล่าสุด **consumed = 0 ทุกแถว** → ไม่มีการกลับมาแลก code เลย
- Edge function logs ของ `line-oauth-callback`: **ไม่มี log จากผู้ใช้จริงเลยวันนี้**
- เหตุการณ์ `callback_received` / `state_invalid` วันนี้ (08:04–08:22) มาจาก IP 34.77.22.247 UA `curl` / `HeadlessChrome` = การทดสอบ QA ของเราเอง ไม่ใช่ผู้ใช้
- ครั้งสุดท้ายที่ flow สำเร็จครบ (`token_exchanged → id_token_verified → session_created`) คือ **2026-08-08 11:08Z** หลังจากนั้นไม่มีอีกเลย
- `verify_jwt = false` ของ `line-oauth-callback` ตั้งถูกแล้ว (ไม่ได้ถูก 401 บล็อก)
- ทดสอบยิง authorize URL จาก server ได้ 400 ทั้งหมด รวมถึง client_id ปลอม → **ผลนี้ใช้สรุปไม่ได้** (LINE บังคับเปิดผ่านเบราว์เซอร์) จึงไม่นำมาใช้เป็นหลักฐาน

## แยกประเด็นให้ชัด
`LINE_CHANNEL_ACCESS_TOKEN` ตอบ 400 เป็นเรื่องของ **Messaging API (friendship check)** คนละ channel คนละ credential กับ LINE Login — **ไม่ใช่สาเหตุ**ของการล็อกอินไม่ผ่านครั้งนี้

## สิ่งที่ยังยืนยันไม่ได้ (ไม่เดา)
- ค่าจริงของ `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` (เป็น secret) — ตรวจได้เฉพาะว่ามีการอ้างอิงในโค้ด และ `line-config-check` มีตัวตรวจ "รูปแบบ" อยู่แล้ว แต่ต้องล็อกอินสิทธิ์แอดมินจึงเรียกได้
- ข้อความ error ที่ผู้ใช้เห็นบนหน้าจอ LINE (ระบบเราไม่ได้บันทึก เพราะเกิดบนโดเมน access.line.me)

## ขั้นถัดไปที่ขอจากเจ้าของร้าน (ยังไม่แก้โค้ด)
1. ส่ง **สกรีนช็อตหน้าจอ LINE ตอนถูกปฏิเสธ** (ข้อความเต็ม เช่น "400 Bad Request" หรือ "invalid redirect_uri") + URL บนแถบที่อยู่
2. ใน LINE Developers Console เปิด **LINE Login channel** (ไม่ใช่ Messaging API) แล้วยืนยัน:
   - Channel ID ตรงกับที่ระบบตั้งไว้เป็น `LINE_LOGIN_CHANNEL_ID`
   - แท็บ **LINE Login → Callback URL** มีบรรทัด `https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/line-oauth-callback` (ไม่มี / ต่อท้าย, ไม่มีช่องว่าง) และกด **Update** แล้ว
   - **Channel status = Published** (ถ้าเป็น Developing ผู้ใช้ที่ไม่ใช่ tester จะถูกปฏิเสธ)
   - แท็บ Basic settings: OpenID Connect / scope `openid`, `profile` เปิดใช้งาน
3. ถ้าข้อ 2 ครบถูกต้องแล้วยังพัง → ขั้นตอนถัดไปคือให้ผมเทียบ `LINE_LOGIN_CHANNEL_ID` ที่ระบบใช้กับ Channel ID จริง (แสดงเฉพาะเลข channel id ซึ่งไม่ใช่ความลับ) ผ่านหน้าตรวจสอบของแอดมิน แล้วค่อยตัดสินใจแก้

## ยืนยัน
รอบนี้ **ไม่มีการแก้โค้ด ไม่มี migration ไม่มี deploy ไม่มี publish** และไม่มีการเปิดเผยค่า secret ใด ๆ
