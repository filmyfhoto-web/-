CREATE TABLE IF NOT EXISTS public.pos_receipt_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idem_key text NOT NULL,
  receipt_id uuid,
  receipt_number text,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_receipt_attachments_idem_idx ON public.pos_receipt_attachments (idem_key);
CREATE INDEX IF NOT EXISTS pos_receipt_attachments_receipt_idx ON public.pos_receipt_attachments (receipt_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_receipt_attachments TO authenticated;
GRANT ALL ON public.pos_receipt_attachments TO service_role;

ALTER TABLE public.pos_receipt_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage pos attachments" ON public.pos_receipt_attachments;
CREATE POLICY "staff manage pos attachments"
ON public.pos_receipt_attachments
FOR ALL
TO authenticated
USING (public.is_staff_any(auth.uid()))
WITH CHECK (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "staff read pos attachment files" ON storage.objects;
CREATE POLICY "staff read pos attachment files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pos-attachments' AND public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "staff upload pos attachment files" ON storage.objects;
CREATE POLICY "staff upload pos attachment files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pos-attachments' AND public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "staff delete pos attachment files" ON storage.objects;
CREATE POLICY "staff delete pos attachment files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pos-attachments' AND public.is_staff_any(auth.uid()));