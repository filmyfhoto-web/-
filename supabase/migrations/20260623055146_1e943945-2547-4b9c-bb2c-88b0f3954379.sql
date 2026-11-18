
CREATE OR REPLACE FUNCTION public.get_my_prices(p_product_ids uuid[])
 RETURNS TABLE(product_id uuid, price numeric, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_group uuid;
  v_markup numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NOT NULL THEN
    SELECT o.price_group_id INTO v_group FROM public.organizations o WHERE o.id = v_org;
  END IF;
  IF v_group IS NOT NULL THEN
    SELECT g.markup_percent INTO v_markup FROM public.price_groups g WHERE g.id = v_group;
  END IF;

  RETURN QUERY
  WITH ids AS (SELECT unnest(p_product_ids) AS pid)
  SELECT
    ids.pid AS product_id,
    COALESCE(
      cp.price,
      gp.price,
      CASE WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 AND v_markup IS NOT NULL
           THEN round(pr.standard_price * (1 + v_markup/100.0), 2) END,
      CASE WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 THEN pr.standard_price END
    ) AS price,
    CASE
      WHEN cp.price IS NOT NULL THEN 'customer'
      WHEN gp.price IS NOT NULL THEN 'group'
      WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 AND v_markup IS NOT NULL THEN 'group'
      WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 THEN 'standard'
      ELSE 'pending'
    END AS source
  FROM ids
  LEFT JOIN public.products pr ON pr.id = ids.pid
  LEFT JOIN public.customer_prices cp ON cp.product_id = ids.pid AND cp.organization_id = v_org
  LEFT JOIN public.group_prices gp ON gp.product_id = ids.pid AND gp.price_group_id = v_group;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_get_price_matrix(p_search text DEFAULT ''::text, p_category uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, code text, name text, unit text, category_id uuid, stock numeric, cost_price numeric, standard_price numeric, group_prices jsonb, customer_price_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    p.id, p.code, p.name, p.unit, p.category_id, p.stock,
    pc.cost_price, p.standard_price,
    (
      SELECT jsonb_object_agg(g.id::text, jsonb_build_object(
        'markup', g.markup_percent,
        'name', g.name,
        'override', gp.price,
        'price', COALESCE(
          gp.price,
          CASE WHEN p.standard_price IS NOT NULL AND p.standard_price > 0
               THEN round(p.standard_price * (1 + g.markup_percent/100.0), 2) END
        )
      ))
      FROM public.price_groups g
      LEFT JOIN public.group_prices gp ON gp.price_group_id = g.id AND gp.product_id = p.id
    ) AS group_prices,
    (SELECT count(*)::int FROM public.customer_prices cp WHERE cp.product_id = p.id) AS customer_price_count
  FROM public.products p
  LEFT JOIN public.product_costs pc ON pc.product_id = p.id
  WHERE p.active = true
    AND (p_category IS NULL OR p.category_id = p_category)
    AND (coalesce(p_search,'') = '' OR p.name ILIKE '%'||p_search||'%' OR p.code ILIKE '%'||p_search||'%')
  ORDER BY p.name
  LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0);
END $function$;
