
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS school_token text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_school_token()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_token := substr(md5(random()::text || clock_timestamp()::text), 1, 12)
            || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE school_token = v_token) THEN
      RETURN v_token;
    END IF;
    IF v_attempt > 8 THEN RAISE EXCEPTION 'could not allocate school_token'; END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_organizations_set_school_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.school_token IS NULL OR NEW.school_token = '' THEN
    NEW.school_token := public.generate_school_token();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS organizations_set_school_token ON public.organizations;
CREATE TRIGGER organizations_set_school_token
BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.trg_organizations_set_school_token();

UPDATE public.organizations SET school_token = public.generate_school_token()
WHERE school_token IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_school_token(p_token text)
RETURNS TABLE(id uuid, name text, price_group_id uuid, slug text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.price_group_id, o.slug
  FROM public.organizations o
  WHERE o.school_token = p_token AND o.deleted_at IS NULL
  LIMIT 1
$$;

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
         COALESCE(cp.price, gp.price, p.price)::numeric AS price,
         CASE
           WHEN cp.price IS NOT NULL THEN 'customer'
           WHEN gp.price IS NOT NULL THEN 'group'
           WHEN p.price IS NOT NULL THEN 'standard'
           ELSE 'pending'
         END AS source
  FROM public.products p
  LEFT JOIN public.customer_prices cp ON cp.product_id = p.id AND cp.organization_id = v_org_id
  LEFT JOIN public.group_prices gp ON gp.product_id = p.id AND gp.price_group_id = v_group_id
  WHERE p.id = ANY(p_product_ids);
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_school_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_prices_by_token(text, uuid[]) TO anon, authenticated;
