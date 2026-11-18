
GRANT SELECT ON public.order_status_events TO anon;

DROP POLICY IF EXISTS "public read order_status_events" ON public.order_status_events;
CREATE POLICY "public read order_status_events"
  ON public.order_status_events
  FOR SELECT
  TO anon, authenticated
  USING (true);
