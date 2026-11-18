DROP POLICY IF EXISTS "nw store users read line events" ON public.nw_line_webhook_events;
CREATE POLICY "nw store users read line events"
  ON public.nw_line_webhook_events FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));