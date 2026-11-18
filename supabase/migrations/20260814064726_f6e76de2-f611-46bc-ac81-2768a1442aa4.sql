INSERT INTO public.internal_worker_tokens (name, token)
VALUES ('myshop_stock_sync', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('myshop-stock-sync-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'myshop-stock-sync-every-minute');

SELECT cron.schedule(
  'myshop-stock-sync-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/myshop-stock-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Oy74UfxFhI4yLlqBR2ZzpQ_B3xGF5rG',
      'x-worker-token', (select token from public.internal_worker_tokens where name = 'myshop_stock_sync')
    ),
    body := jsonb_build_object('action', 'drain', 'limit', 100)
  );
  $$
);