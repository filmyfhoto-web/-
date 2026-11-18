DROP POLICY IF EXISTS "cpo_events_owner_read" ON public.customer_po_review_events;
REVOKE ALL ON public.customer_po_review_events FROM anon;