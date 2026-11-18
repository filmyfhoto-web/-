-- The read policies for these two operational tables already restrict rows to
-- owners/admins, but the Data API had no privileges at all on them, so the
-- Notification Center could never read a single row. Grant read only: writes
-- stay exclusive to the service role (the dispatcher and its helper functions).
REVOKE ALL ON public.notification_outbox FROM anon, authenticated;
REVOKE ALL ON public.notification_dispatch_runs FROM anon, authenticated;

GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT SELECT ON public.notification_dispatch_runs TO authenticated;

GRANT ALL ON public.notification_outbox TO service_role;
GRANT ALL ON public.notification_dispatch_runs TO service_role;

-- Belt and braces: make the "no client writes" rule explicit as policies too,
-- so a future GRANT cannot silently open up enqueueing from the browser.
DROP POLICY IF EXISTS "no client writes to outbox" ON public.notification_outbox;
CREATE POLICY "no client writes to outbox"
  ON public.notification_outbox FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "no client updates to outbox" ON public.notification_outbox;
CREATE POLICY "no client updates to outbox"
  ON public.notification_outbox FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no client writes to dispatch runs" ON public.notification_dispatch_runs;
CREATE POLICY "no client writes to dispatch runs"
  ON public.notification_dispatch_runs FOR INSERT TO authenticated, anon
  WITH CHECK (false);