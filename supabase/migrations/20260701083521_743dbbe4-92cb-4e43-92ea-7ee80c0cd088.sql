
CREATE OR REPLACE FUNCTION public.get_prices_by_org(p_org_id uuid, p_product_ids uuid[])
RETURNS TABLE(product_id uuid, price numeric, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_org_id IS NOT NULL THEN
    SELECT price_group_id INTO v_group_id FROM public.organizations WHERE id = p_org_id;
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.get_prices_by_org(uuid, uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_prices_by_token(p_token text, p_product_ids uuid[])
RETURNS TABLE(product_id uuid, price numeric, source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_group_id uuid;
BEGIN
  IF p_token IS NULL OR length(btrim(p_token)) < 8 THEN
    RAISE EXCEPTION 'invalid school token';
  END IF;
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  SELECT o.id, o.price_group_id INTO v_org_id, v_group_id
    FROM public.organizations o
   WHERE o.school_token = p_token AND o.deleted_at IS NULL
   LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'school token not found or expired';
  END IF;

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
  LEFT JOIN public.customer_prices cp ON cp.product_id = p.id AND cp.organization_id = v_org_id
  LEFT JOIN public.group_prices gp ON gp.product_id = p.id AND gp.price_group_id = v_group_id
  WHERE p.id = ANY(p_product_ids);
END $$;

GRANT EXECUTE ON FUNCTION public.get_prices_by_token(text, uuid[]) TO anon, authenticated;
