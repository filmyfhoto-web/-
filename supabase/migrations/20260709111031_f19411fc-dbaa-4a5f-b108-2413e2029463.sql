
ALTER TABLE public.nw_work_orders
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS line_reply_token text;

CREATE TABLE IF NOT EXISTS public.nw_line_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_type text,
  message_type text,
  line_user_id text,
  raw jsonb NOT NULL,
  matched_keyword boolean NOT NULL DEFAULT false,
  work_order_id uuid REFERENCES public.nw_work_orders(id) ON DELETE SET NULL,
  error text
);

CREATE INDEX IF NOT EXISTS nw_line_webhook_events_received_at_idx
  ON public.nw_line_webhook_events (received_at DESC);

GRANT SELECT ON public.nw_line_webhook_events TO authenticated;
GRANT ALL ON public.nw_line_webhook_events TO service_role;

ALTER TABLE public.nw_line_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nw store users read line events" ON public.nw_line_webhook_events;
CREATE POLICY "nw store users read line events"
  ON public.nw_line_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.nw_has_store_access(auth.uid()));
