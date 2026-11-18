
-- 1. products: change anon-readable policy to authenticated only
DROP POLICY IF EXISTS "staff_any read products" ON public.products;
CREATE POLICY "staff_any read products" ON public.products
  FOR SELECT TO authenticated
  USING (
    is_staff_any(auth.uid())
    OR (deleted_at IS NULL AND active = true AND status = ANY (ARRAY['published'::product_status, 'low_stock'::product_status]))
  );
REVOKE SELECT ON public.products FROM anon;

-- 2. product_shops: restrict reads to staff only (customers don't need per-store breakdown)
DROP POLICY IF EXISTS "product_shops_auth_read" ON public.product_shops;
CREATE POLICY "product_shops_staff_read" ON public.product_shops
  FOR SELECT TO authenticated
  USING (is_staff_any(auth.uid()));
REVOKE SELECT ON public.product_shops FROM anon;

-- 3. Fix mutable search_path on functions
CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  base text;
  candidate text;
  i int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  IF base = '' OR length(base) < 2 THEN
    base := 'org-' || substr(md5(coalesce(p_name,'') || clock_timestamp()::text), 1, 6);
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = candidate) LOOP
    i := i + 1;
    candidate := base || '-' || i::text;
  END LOOP;
  RETURN candidate;
END $function$;

CREATE OR REPLACE FUNCTION public.organizations_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_org_slug(NEW.name);
  END IF;
  RETURN NEW;
END $function$;
