ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

DROP POLICY IF EXISTS "users self-signup general org pending approval" ON public.organizations;
CREATE POLICY "users self-signup general org pending approval"
ON public.organizations FOR INSERT TO authenticated
WITH CHECK (
  approved = false
  AND price_group_id IS NULL
  AND type = 'general'::customer_type
  AND created_by = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.created_by = auth.uid()
      AND o.approved = false
      AND o.deleted_at IS NULL
  )
);

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
      AND c.store_id IS NOT NULL
      AND c.store_id IN (SELECT s.store_id FROM public.customer_linked_store_ids(auth.uid()) s)
  );
$function$;

CREATE OR REPLACE FUNCTION public.customer_owns_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.rds_documents d
    JOIN public.rds_customers c ON c.id = d.customer_id
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE d.id = _doc_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
      AND p.organization_id IS NOT NULL
      AND c.store_id IS NOT NULL
      AND d.store_id = c.store_id
      AND c.store_id IN (SELECT s.store_id FROM public.customer_linked_store_ids(auth.uid()) s)
  );
$function$;