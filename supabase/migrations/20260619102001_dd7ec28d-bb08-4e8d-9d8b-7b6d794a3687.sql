
-- 1) Restrict products table SELECT to staff only
DROP POLICY IF EXISTS "anyone read active products" ON public.products;
CREATE POLICY "staff read products" ON public.products
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

-- 2) Public-safe view excluding stock/low_stock_threshold
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public
WITH (security_invoker = false) AS
SELECT id, code, name, category_id, description, unit, image_url,
       standard_price, active, created_at, updated_at
FROM public.products
WHERE active = true;

GRANT SELECT ON public.products_public TO anon, authenticated;

-- 3) Restrict price_groups SELECT to staff only
DROP POLICY IF EXISTS "anyone read price groups" ON public.price_groups;
CREATE POLICY "staff read price groups" ON public.price_groups
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));
