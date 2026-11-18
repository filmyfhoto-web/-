CREATE TABLE IF NOT EXISTS public.nw_work_order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  work_order_id uuid NOT NULL REFERENCES public.nw_work_orders(id) ON DELETE CASCADE,
  path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_work_order_attachments TO authenticated;
GRANT ALL ON public.nw_work_order_attachments TO service_role;

ALTER TABLE public.nw_work_order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nw_attachments staff manage"
ON public.nw_work_order_attachments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'stock_staff'::app_role)
  OR public.has_role(auth.uid(), 'photo_staff'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'stock_staff'::app_role)
  OR public.has_role(auth.uid(), 'photo_staff'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_nw_attachments_wo ON public.nw_work_order_attachments(work_order_id);

CREATE POLICY "nw-attach staff read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'nw-attachments' AND (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'stock_staff'::app_role)
    OR public.has_role(auth.uid(), 'photo_staff'::app_role)
  )
);

CREATE POLICY "nw-attach staff write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'nw-attachments' AND (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'stock_staff'::app_role)
    OR public.has_role(auth.uid(), 'photo_staff'::app_role)
  )
);

CREATE POLICY "nw-attach owner-admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'nw-attachments' AND (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);
