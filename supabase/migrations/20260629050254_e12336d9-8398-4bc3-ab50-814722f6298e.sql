
ALTER TABLE public.line_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient text,
  ADD COLUMN IF NOT EXISTS kind text;

CREATE UNIQUE INDEX IF NOT EXISTS line_notifications_idem_uniq
  ON public.line_notifications(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- allow staff to update for retry bookkeeping via service role only; no client UPDATE policy.
-- (service role bypasses RLS anyway)
