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
      'x-worker-token', (select token from public.internal_worker_tokens where name = 'myshop_autopublish')
    ),
    body := jsonb_build_object('action', 'full_backfill', 'publish_limit', 60, 'sync_limit', 200)
  );
  $$
);