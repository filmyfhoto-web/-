# ระบบรวมข้อความ LINE → Inbox บนเว็บแอป (Multi-store)

## 1. โครงสร้างไฟล์

```
supabase/functions/
  line-webhook/index.ts          # รับ webhook, ตรวจ HMAC signature, ตอบ 200 ทันที (fast-ack)
  _shared/lineChannels.ts        # โหลด credential ของทุกร้าน + จับคู่ร้านจากลายเซ็น
  _shared/inboxStore.ts          # upsertConversation / recordMessage (idempotent)
  _shared/linePush.ts            # reply & push ไป LINE
  film-inbox-send-message/       # ส่งข้อความออกจากแอป (idempotency key)
  film-inbox-refresh-profiles/   # sync ชื่อ/รูปโปรไฟล์ลูกค้า
  film-inbox-readiness/          # health check ของแต่ละร้าน

src/film-shop/
  hooks/useFilmInbox.ts          # โหลดห้องแชต/ข้อความ + realtime + catch-up
  hooks/useRealtimeWithFallback.ts
  components/inbox/FilmInboxPage.tsx   # 3 pane: รายการห้อง / แชต / Customer360
  components/inbox/ConversationList.tsx, MessageThread.tsx, Customer360.tsx
  lib/notifySound.ts             # เสียงแจ้งเตือน (Web Audio, ตั้งโทน/ระดับเสียงได้)
  lib/desktopNotify.ts           # Browser Notifications API
  lib/webPush.ts + public/push-sw.js   # Web Push ถาวร (แจ้งแม้ปิดแท็บ)
```

## 2. ฐานข้อมูล (แยกร้านด้วย `store_id`)

| ตาราง | หน้าที่ |
|---|---|
| `film_conversations` | 1 แถว = 1 ห้องแชต — unique `(channel, store_id, external_thread_id)` |
| `film_messages` | ข้อความทั้งขาเข้า/ขาออก — unique `external_message_id`, `idempotency_key` |
| `line_store_customers` | โปรไฟล์ลูกค้า แยกตาม `(store_id, line_user_id)` |
| `line_webhook_dedup` | กัน LINE ยิงซ้ำ ด้วย `webhook_event_id` (PK) |
| `line_webhook_events` | log ดิบทุก event ไว้ debug |
| `line_credentials` | secret/token รายร้าน (อ่านได้เฉพาะ service role) |

การแยกร้าน: ทุกแถวมี `store_id` = id ของ LINE channel (`default`, `shop2`, `runqueue`)
ลูกค้าคนเดียวทักสองร้าน = สองห้องแชต ข้อมูลไม่ปนกัน และ RLS จำกัดตามร้านที่พนักงานมีสิทธิ์

## 3. Webhook Receiver — ทำไมถึงไม่หลุด

1. **Signature validation** — คำนวณ HMAC-SHA256 ของ raw body เทียบกับ `x-line-signature`
   ลองทีละ channel secret เพื่อรู้ว่าเป็นข้อความของร้านไหน (`matchChannelBySignature`)
   ไม่ผ่าน = 401 และบันทึกเหตุผลไว้ตรวจ
2. **Fast-ack** — หลังตรวจลายเซ็นเสร็จ ตอบ `200 {ok:true}` ทันที
   งานหนัก (Profile API, อัปโหลดไฟล์แนบ, AI, reply) ทำต่อเบื้องหลังด้วย
   `EdgeRuntime.waitUntil` → ไม่มีทาง timeout ที่ 1 วินาทีของ LINE
3. **Idempotency 2 ชั้น**
   - insert `line_webhook_dedup(webhook_event_id)` — ซ้ำ = ข้าม event
   - unique index `film_messages.external_message_id` — ต่อให้ redeliver ก็ไม่มีข้อความเบิ้ล
4. **Prepared statements** — เขียนผ่าน PostgREST/supabase-js เท่านั้น ไม่มีการต่อ SQL string
5. **ทุก handler ห่อ try/catch** — ข้อผิดพลาดของ flow หนึ่งไม่ทำให้ทั้ง batch ล้ม
   และไม่ทำให้ตอบ non-2xx (ซึ่งจะทำให้ LINE ส่งซ้ำไม่จบ)

URL แยกร้าน: `.../line-webhook?ch=default`, `?ch=shop2`, `?ch=runqueue`

## 4. Real-time ถึงหน้าจอพนักงาน

ใช้ Supabase Realtime (WebSocket) บน `postgres_changes` ของ `film_messages` / `film_conversations`
เพิ่มความทน:
- reconnect อัตโนมัติแบบ exponential backoff + jitter (สูงสุด 30 วิ)
- **catch-up query** ทุกครั้งที่เชื่อมต่อใหม่ / กลับมาโฟกัสแท็บ / กลับมาออนไลน์
  ดึงข้อความ inbound ที่ใหม่กว่าเวลาล่าสุดที่เห็น → ไม่มีข้อความหาย
- polling สำรองทุก 20 วินาที เมื่อ websocket ไม่ปกติ
- กันเด้งซ้ำด้วยชุด message id ที่แจ้งไปแล้ว

## 5. การแจ้งเตือนหน้าบ้าน

- **เสียง**: `playNotificationSound()` (Web Audio; ต้อง `primeNotificationSound()` ครั้งแรกจาก user gesture ตามนโยบาย autoplay)
- **มุมจอ**: `showDesktopNotification()` → Notifications API, คลิกแล้วเปิดห้องแชตนั้นทันที
- **ปิดแท็บอยู่**: Web Push ผ่าน `push-sw.js` + edge function `send-web-push` (VAPID)
- ตั้งค่าเปิด/ปิดรายประเภทได้ที่หน้า “ตั้งค่าการแจ้งเตือน”

## 6. ขั้นตอนติดตั้ง / ต่อร้านใหม่

1. สร้าง Messaging API channel ใน LINE Developers
2. บันทึก `channel secret` + `channel access token` ที่หน้า **แอดมิน → LINE OA → ตั้งค่า**
   (เก็บลง `line_credentials`, ไม่เคยอยู่ในโค้ดฝั่ง client)
3. ตั้ง Webhook URL เป็น `https://<project>.functions.supabase.co/line-webhook?ch=<store_id>` แล้วกด Verify
4. ปิด Auto-reply / Greeting ใน LINE Official Account Manager
5. เปิดหน้า **Inbox** กดอนุญาตการแจ้งเตือน + กดเปิดเสียงหนึ่งครั้ง
6. ตรวจสุขภาพด้วยหน้า “ทดสอบระบบ” (`film-inbox-readiness`, `line-webhook-selftest`)

## 7. เช็คลิสต์ความเสถียร

- Webhook ต้องตอบ 200 ภายใน < 300ms เสมอ (ดู log `accepted`)
- ถ้าเห็น `signature_mismatch` ใน `line_webhook_events` = secret ไม่ตรงกับ channel
- ถ้าข้อความเข้าช้า/ไม่เข้า: ดู `line_webhook_events` ก่อน (ถึง server ไหม) แล้วค่อยดู realtime
- อย่าลบแถว `line_webhook_dedup` เร็วเกินไป — เก็บอย่างน้อย 24 ชม.
- แจ้งเตือนสำคัญให้พึ่ง Web Push (ไม่ขึ้นกับแท็บเปิดอยู่)
