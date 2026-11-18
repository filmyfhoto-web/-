select cron.schedule(
  'myshop-sync-mapped-hourly',
  '27 * * * *',
  $$
  select net.http_post(
    url := 'https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/myshop-admin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Oy74UfxFhI4yLlqBR2ZzpQ_B3xGF5rG',
      'x-worker-token', (select token from public.internal_worker_tokens where name = 'myshop_autopublish')
    ),
    body := jsonb_build_object('action', 'sync_mapped')
  );
  $$
);