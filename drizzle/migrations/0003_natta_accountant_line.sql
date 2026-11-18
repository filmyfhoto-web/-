-- น้องนัตต้า (ผู้ช่วยบัญชี LINE ของ Film Shop)
-- 1) soft-void ให้ film_transactions (ไม่ลบข้อมูลจริง)
ALTER TABLE public.film_transactions
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by text,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- 2) กันรายการซ้ำเมื่อ LINE ส่ง webhook ซ้ำ
CREATE UNIQUE INDEX IF NOT EXISTS film_transactions_line_message_uidx
  ON public.film_transactions (line_message_id)
  WHERE line_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS film_transactions_line_event_uidx
  ON public.film_transactions (line_webhook_event_id)
  WHERE line_webhook_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_transactions_date_idx
  ON public.film_transactions (date DESC);

-- 3) คำสั่งที่รอการยืนยันจากผู้ใช้ LINE (แก้ไข/ลบรายการ)
CREATE TABLE IF NOT EXISTS public.film_line_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.film_line_pending_actions TO service_role;

ALTER TABLE public.film_line_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read pending line actions" ON public.film_line_pending_actions;
CREATE POLICY "staff read pending line actions"
  ON public.film_line_pending_actions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.film_line_pending_actions TO authenticated;

CREATE INDEX IF NOT EXISTS film_line_pending_actions_user_idx
  ON public.film_line_pending_actions (line_user_id, created_at DESC);
