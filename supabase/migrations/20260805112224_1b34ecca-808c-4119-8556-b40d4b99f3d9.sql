CREATE TABLE IF NOT EXISTS public.internal_worker_tokens (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.internal_worker_tokens TO service_role;
ALTER TABLE public.internal_worker_tokens ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only service_role (edge functions) and the cron
-- job owner may ever read this row.

INSERT INTO public.internal_worker_tokens (name)
VALUES ('notify_dispatch')
ON CONFLICT (name) DO NOTHING;