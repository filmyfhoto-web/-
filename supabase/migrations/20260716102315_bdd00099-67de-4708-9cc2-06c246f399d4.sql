DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='line_webhook_events') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.line_webhook_events';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_view_logs') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.product_view_logs';
  END IF;
END $$;