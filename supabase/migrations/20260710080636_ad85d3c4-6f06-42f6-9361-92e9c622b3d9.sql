DROP POLICY IF EXISTS "nw_attachments staff manage" ON public.nw_work_order_attachments;

CREATE POLICY "nw_attachments store scoped"
ON public.nw_work_order_attachments
FOR ALL
TO authenticated
USING (public.nw_has_store_access(store_id))
WITH CHECK (public.nw_has_store_access(store_id));