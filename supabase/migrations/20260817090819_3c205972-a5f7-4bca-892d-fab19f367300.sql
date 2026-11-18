ALTER TABLE public.myshop_integrations
  ADD COLUMN IF NOT EXISTS fallback_image_url text,
  ADD COLUMN IF NOT EXISTS default_weight_kg numeric NOT NULL DEFAULT 0.1,
  ADD COLUMN IF NOT EXISTS auto_publish_enabled boolean NOT NULL DEFAULT false;

INSERT INTO public.internal_worker_tokens (name, token)
VALUES ('myshop_autopublish', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('myshop-auto-publish-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'myshop-auto-publish-hourly');

SELECT cron.schedule(
  'myshop-auto-publish-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/myshop-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Oy74UfxFhI4yLlqBR2ZzpQ_B3xGF5rG',
      'Authorization', 'Bearer worker',
      'x-worker-token', (select token from public.internal_worker_tokens where name = 'myshop_autopublish')
    ),
    body := jsonb_build_object('action', 'auto_publish_all')
  );
  $$
);