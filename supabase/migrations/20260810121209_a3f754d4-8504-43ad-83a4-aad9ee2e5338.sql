CREATE POLICY "customers update own job attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'job-attachments' AND (storage.foldername(name))[1] = 'customer' AND (storage.foldername(name))[2] = (auth.uid())::text)
WITH CHECK (bucket_id = 'job-attachments' AND (storage.foldername(name))[1] = 'customer' AND (storage.foldername(name))[2] = (auth.uid())::text);

CREATE POLICY "customers delete own job attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'job-attachments' AND (storage.foldername(name))[1] = 'customer' AND (storage.foldername(name))[2] = (auth.uid())::text);

CREATE OR REPLACE FUNCTION public.customer_owns_customer_row(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.rds_customers c
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE c.id = _customer_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
      AND p.organization_id IS NOT NULL
  );
$function$;