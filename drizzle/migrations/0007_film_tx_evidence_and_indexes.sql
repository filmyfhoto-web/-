-- หลักฐานแนบของรายการบัญชี (เก็บเฉพาะ path ในบัคเก็ตส่วนตัว ไม่มี URL สาธารณะ)
ALTER TABLE public.film_transactions
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ค้นรายการล่าสุดของผู้ใช้ LINE ตามวัน (ใช้กับ แก้ไขล่าสุด / ยกเลิกล่าสุด)
CREATE INDEX IF NOT EXISTS film_transactions_line_user_date_idx
  ON public.film_transactions (line_user_id, date DESC, created_at DESC)
  WHERE voided_at IS NULL;

-- ร่างที่รอยืนยันของแต่ละผู้ใช้
CREATE INDEX IF NOT EXISTS film_line_pending_actions_open_idx
  ON public.film_line_pending_actions (line_user_id, created_at DESC)
  WHERE consumed_at IS NULL;
