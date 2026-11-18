-- 1) Store-scope customer/document visibility for org members
CREATE OR REPLACE FUNCTION public.customer_linked_store_ids(_uid uuid)
RETURNS TABLE(store_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT c.store_id
  FROM public.rds_customers c
  JOIN public.profiles p ON p.id = _uid
  WHERE c.org_id IS NOT NULL
    AND c.org_id = p.organization_id
    AND (
      (c.line_user_id IS NOT NULL AND c.line_user_id = p.line_user_id)
      OR (c.email IS NOT NULL AND p.email IS NOT NULL AND lower(c.email) = lower(p.email))
      OR (c.phone IS NOT NULL AND p.phone IS NOT NULL
          AND regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p.phone, '\D', '', 'g')
          AND length(regexp_replace(c.phone, '\D', '', 'g')) >= 9)
    );
$$;

CREATE OR REPLACE FUNCTION public.customer_owns_customer_row(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.rds_customers c
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE c.id = _customer_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
      AND p.organization_id IS NOT NULL
      AND (
        c.store_id IN (SELECT s.store_id FROM public.customer_linked_store_ids(auth.uid()) s)
        OR NOT EXISTS (SELECT 1 FROM public.customer_linked_store_ids(auth.uid()))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_owns_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.rds_documents d
    JOIN public.rds_customers c ON c.id = d.customer_id
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE d.id = _doc_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
      AND p.organization_id IS NOT NULL
      AND d.store_id = c.store_id
      AND (
        c.store_id IN (SELECT s.store_id FROM public.customer_linked_store_ids(auth.uid()) s)
        OR NOT EXISTS (SELECT 1 FROM public.customer_linked_store_ids(auth.uid()))
      )
  );
$$;

-- 2) Explicit allowlist for staff-created notification types
CREATE OR REPLACE FUNCTION public.is_allowed_staff_notification_type(_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _type IS NOT NULL AND _type = ANY (ARRAY[
    'new_order','order_created','order_status','doc_status_change',
    'nw_status_change','nw_wo_approved','new_signup','new_customer',
    'org_decision','customer_message','payment_action','quotation_action',
    'low_stock','po_approval','po_receiving','staff_line_approval'
  ]);
$$;

DROP POLICY IF EXISTS "staff insert non-sensitive notifs" ON public.notifications;
CREATE POLICY "staff insert non-sensitive notifs"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  is_staff(auth.uid())
  AND public.is_allowed_staff_notification_type(type)
);