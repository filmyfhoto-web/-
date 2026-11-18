ALTER TABLE public.customer_purchase_orders
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS receive_method text,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS desk_stage text NOT NULL DEFAULT 'files',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.order_notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  notification_type text NOT NULL DEFAULT 'order_created',
  recipient_type text NOT NULL CHECK (recipient_type IN ('customer','admin')),
  target_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error_message text,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_notification_logs TO authenticated;
GRANT ALL ON public.order_notification_logs TO service_role;

ALTER TABLE public.order_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read order notification logs" ON public.order_notification_logs;
CREATE POLICY "staff read order notification logs"
ON public.order_notification_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "staff manage order notification logs" ON public.order_notification_logs;
CREATE POLICY "staff manage order notification logs"
ON public.order_notification_logs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS order_notification_logs_dedupe
  ON public.order_notification_logs (order_id, notification_type, recipient_type);
CREATE INDEX IF NOT EXISTS order_notification_logs_status_idx
  ON public.order_notification_logs (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_order_notification_logs_touch ON public.order_notification_logs;
CREATE TRIGGER trg_order_notification_logs_touch
BEFORE UPDATE ON public.order_notification_logs
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();