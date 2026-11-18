
-- 1) Scope admin invitations to an optional store
ALTER TABLE public.admin_invitations
  ADD COLUMN IF NOT EXISTS store_id uuid NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS admin_invitations_store_id_idx
  ON public.admin_invitations(store_id);

-- Allow store staff to manage invites for THEIR own store (in addition to
-- owners, which the existing policies already cover). Store-less invites
-- remain owner-only because is_staff_of_store returns false when store_id
-- is null.
DROP POLICY IF EXISTS "store_staff_manage_store_invites" ON public.admin_invitations;
CREATE POLICY "store_staff_manage_store_invites"
ON public.admin_invitations
FOR ALL
TO authenticated
USING (store_id IS NOT NULL AND public.is_staff_of_store(auth.uid(), store_id))
WITH CHECK (store_id IS NOT NULL AND public.is_staff_of_store(auth.uid(), store_id));

-- 2) Re-assert the fix for get_prices_by_org (auto-scanner still flagged the
-- prior version). Anonymous and non-member callers only receive standard
-- prices; only authenticated members of p_org_id or admins get negotiated
-- pricing.
CREATE OR REPLACE FUNCTION public.get_prices_by_org(p_org_id uuid, p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, price numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_uid uuid := auth.uid();
  v_is_member boolean := false;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF v_uid IS NOT NULL AND p_org_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_uid AND organization_id = p_org_id
    ) OR public.has_role(v_uid, 'admin'::public.app_role)
    INTO v_is_member;
  END IF;

  IF NOT v_is_member THEN
    RETURN QUERY
    SELECT p.id AS product_id,
           NULLIF(p.standard_price, 0)::numeric AS price,
           CASE WHEN COALESCE(p.standard_price, 0) > 0 THEN 'standard' ELSE 'pending' END AS source
    FROM public.products p
    WHERE p.id = ANY(p_product_ids);
    RETURN;
  END IF;

  SELECT price_group_id INTO v_group_id FROM public.organizations WHERE id = p_org_id;

  RETURN QUERY
  SELECT p.id AS product_id,
         COALESCE(cp.price, gp.price, NULLIF(p.standard_price, 0))::numeric AS price,
         CASE
           WHEN cp.price IS NOT NULL THEN 'customer'
           WHEN gp.price IS NOT NULL THEN 'group'
           WHEN COALESCE(p.standard_price, 0) > 0 THEN 'standard'
           ELSE 'pending'
         END AS source
  FROM public.products p
  LEFT JOIN public.customer_prices cp
    ON cp.product_id = p.id AND cp.organization_id = p_org_id
  LEFT JOIN public.group_prices gp
    ON gp.product_id = p.id AND gp.price_group_id = v_group_id
  WHERE p.id = ANY(p_product_ids);
END
$function$;
