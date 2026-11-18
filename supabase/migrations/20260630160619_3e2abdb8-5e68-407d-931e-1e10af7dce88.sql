
CREATE TABLE public.line_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  signature_ok boolean NOT NULL,
  event_type text,
  source_user_id text,
  message_text text,
  reply_token text,
  raw jsonb NOT NULL,
  handler_result text,
  handler_error text
);

CREATE INDEX idx_line_webhook_events_received_at ON public.line_webhook_events (received_at DESC);

GRANT SELECT ON public.line_webhook_events TO authenticated;
GRANT ALL ON public.line_webhook_events TO service_role;

ALTER TABLE public.line_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read webhook events"
  ON public.line_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.line_webhook_events;
