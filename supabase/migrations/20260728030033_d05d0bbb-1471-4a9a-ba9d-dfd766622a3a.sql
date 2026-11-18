CREATE TABLE IF NOT EXISTS public.line_credentials (
  id text PRIMARY KEY DEFAULT 'default',
  channel_access_token text,
  channel_secret text,
  token_last4 text,
  secret_last4 text,
  bot_basic_id text,
  bot_display_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT ALL ON public.line_credentials TO service_role;

ALTER TABLE public.line_credentials ENABLE ROW LEVEL SECURITY;
