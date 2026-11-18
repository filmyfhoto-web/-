DROP POLICY IF EXISTS film_invoice_attachments_read ON storage.objects;
DROP POLICY IF EXISTS film_invoice_attachments_write ON storage.objects;
DROP POLICY IF EXISTS film_invoice_attachments_update ON storage.objects;
DROP POLICY IF EXISTS film_invoice_attachments_delete ON storage.objects;

CREATE POLICY film_invoice_attachments_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'stock_staff')
      OR public.has_role(auth.uid(), 'photo_staff')
    )
  );

CREATE POLICY film_invoice_attachments_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'stock_staff')
      OR public.has_role(auth.uid(), 'photo_staff')
    )
  );

CREATE POLICY film_invoice_attachments_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'stock_staff')
      OR public.has_role(auth.uid(), 'photo_staff')
    )
  )
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'stock_staff')
      OR public.has_role(auth.uid(), 'photo_staff')
    )
  );

CREATE POLICY film_invoice_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'stock_staff')
      OR public.has_role(auth.uid(), 'photo_staff')
    )
  );