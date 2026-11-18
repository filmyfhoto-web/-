GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_orders TO authenticated;
GRANT ALL ON public.film_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_items TO authenticated;
GRANT ALL ON public.film_order_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_jobs TO authenticated;
GRANT ALL ON public.film_order_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_events TO authenticated;
GRANT ALL ON public.film_order_events TO service_role;

GRANT EXECUTE ON FUNCTION public.film_next_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.film_next_order_number() TO service_role;

ALTER TABLE public.film_orders REPLICA IDENTITY FULL;
ALTER TABLE public.film_order_items REPLICA IDENTITY FULL;
ALTER TABLE public.film_order_jobs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='film_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.film_orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='film_order_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.film_order_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='film_order_jobs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.film_order_jobs;
  END IF;
END $$;