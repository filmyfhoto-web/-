
DROP POLICY IF EXISTS "nw-attach staff read" ON storage.objects;
DROP POLICY IF EXISTS "nw-attach staff write" ON storage.objects;
DROP POLICY IF EXISTS "nw-attach owner-admin delete" ON storage.objects;

CREATE POLICY "nw-attach staff read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'nw-attachments'
  AND (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      (has_role(auth.uid(), 'stock_staff'::app_role) OR has_role(auth.uid(), 'photo_staff'::app_role))
      AND public.nw_has_store_access((split_part(name, '/', 1))::uuid)
    )
  )
);

CREATE POLICY "nw-attach staff write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'nw-attachments'
  AND (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR (
      (has_role(auth.uid(), 'stock_staff'::app_role) OR has_role(auth.uid(), 'photo_staff'::app_role))
      AND public.nw_has_store_access((split_part(name, '/', 1))::uuid)
    )
  )
);

CREATE POLICY "nw-attach owner-admin delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'nw-attachments'
  AND (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
