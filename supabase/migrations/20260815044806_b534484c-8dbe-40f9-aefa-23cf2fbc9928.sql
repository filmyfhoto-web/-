ALTER TABLE public.line_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS group_id text,
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS ref_code text;

CREATE INDEX IF NOT EXISTS line_webhook_events_group_id_idx
  ON public.line_webhook_events (group_id, received_at DESC);

CREATE INDEX IF NOT EXISTS line_webhook_events_ref_code_idx
  ON public.line_webhook_events (ref_code)
  WHERE ref_code IS NOT NULL;