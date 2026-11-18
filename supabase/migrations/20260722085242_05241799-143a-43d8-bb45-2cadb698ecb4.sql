
-- Server-side generator for job-order numbers. Reads the max existing
-- JO-YYMM#### for the current month and returns the next one. Runs as
-- SECURITY DEFINER so RLS on film_invoices does not block the read.
CREATE OR REPLACE FUNCTION public.film_next_job_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  last_no int;
BEGIN
  prefix := 'JO-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM');
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^' || prefix, ''), '')::int), 0)
    INTO last_no
    FROM public.film_invoices
   WHERE type = 'job_order'
     AND invoice_number LIKE prefix || '%';
  RETURN prefix || lpad((last_no + 1)::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.film_next_job_order_number() TO authenticated;

-- Storage policies for invoice attachments (bucket created via storage_create_bucket)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='film_invoice_attachments_read') THEN
    CREATE POLICY "film_invoice_attachments_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'invoice-attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='film_invoice_attachments_write') THEN
    CREATE POLICY "film_invoice_attachments_write"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'invoice-attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='film_invoice_attachments_update') THEN
    CREATE POLICY "film_invoice_attachments_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'invoice-attachments')
      WITH CHECK (bucket_id = 'invoice-attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='film_invoice_attachments_delete') THEN
    CREATE POLICY "film_invoice_attachments_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'invoice-attachments');
  END IF;
END $$;
