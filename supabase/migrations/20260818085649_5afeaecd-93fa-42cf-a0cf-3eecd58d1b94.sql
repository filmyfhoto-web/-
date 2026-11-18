ALTER TABLE public.film_intake_form_tokens
  ADD COLUMN IF NOT EXISTS prefill jsonb,
  ADD COLUMN IF NOT EXISTS card_key text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'command',
  ADD COLUMN IF NOT EXISTS source_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS film_intake_form_tokens_card_key_uniq
  ON public.film_intake_form_tokens (card_key) WHERE card_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS film_intake_form_tokens_src_msg_uniq
  ON public.film_intake_form_tokens (source_message_id) WHERE source_message_id IS NOT NULL;

GRANT ALL ON public.film_intake_form_tokens TO service_role;