INSERT INTO public.internal_worker_tokens (name) VALUES ('line_endpoint_monitor') ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  SELECT token INTO t FROM public.internal_worker_tokens WHERE name = 'line_endpoint_monitor';
  PERFORM cron.unschedule('line-endpoint-monitor-15min');
  PERFORM cron.schedule('line-endpoint-monitor-15min', '*/15 * * * *', format($f$
    SELECT net.http_post(
      url:='https://fdgxvgtmzcgakofswtty.supabase.co/functions/v1/line-endpoint-monitor',
      headers:=%L::jsonb,
      body:=concat('{"at":"', now(), '"}')::jsonb
    );
  $f$, json_build_object('Content-Type','application/json','apikey','sb_publishable_Oy74UfxFhI4yLlqBR2ZzpQ_B3xGF5rG','x-worker-token', t)::text));
END $$;