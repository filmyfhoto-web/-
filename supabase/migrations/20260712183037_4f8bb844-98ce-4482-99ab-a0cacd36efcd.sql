
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

  -- Require an authenticated caller. Anonymous callers get nothing.
  IF v_uid IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;

  -- Verify the caller belongs to the org (or is an admin).
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND organization_id = p_org_id
  ) OR public.has_role(v_uid, 'admin'::public.app_role)
  INTO v_is_member;

  -- Non-members receive no pricing data at all.
  IF NOT v_is_member THEN
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

REVOKE ALL ON FUNCTION public.get_prices_by_org(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_prices_by_org(uuid, uuid[]) TO authenticated, service_role;
