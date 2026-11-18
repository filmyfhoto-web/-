
-- 1. Remove customer SELECT on customer_prices (RPC get_my_prices is the supported path)
DROP POLICY IF EXISTS "users read own customer prices" ON public.customer_prices;
CREATE POLICY "staff read customer prices" ON public.customer_prices
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 2. Remove customer SELECT on group_prices
DROP POLICY IF EXISTS "read own group prices" ON public.group_prices;
CREATE POLICY "staff read group prices" ON public.group_prices
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 3. Restrict products table SELECT to authenticated/staff; anon goes through products_public view
DROP POLICY IF EXISTS "public read active products" ON public.products;
CREATE POLICY "authenticated read active products" ON public.products
  FOR SELECT TO authenticated
  USING (active = true OR public.is_staff(auth.uid()));

-- Make products_public view bypass caller RLS so anon can still browse (it excludes stock columns)
ALTER VIEW public.products_public SET (security_invoker = false);
REVOKE ALL ON public.products_public FROM anon, authenticated;
GRANT SELECT ON public.products_public TO anon, authenticated;

-- 4. Lock privileged columns in organizations UPDATE policy at RLS level
DROP POLICY IF EXISTS "users update own org" ON public.organizations;
CREATE POLICY "users update own org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND approved = (SELECT approved FROM public.organizations o2 WHERE o2.id = organizations.id)
    AND price_group_id IS NOT DISTINCT FROM (SELECT price_group_id FROM public.organizations o2 WHERE o2.id = organizations.id)
    AND type = (SELECT type FROM public.organizations o2 WHERE o2.id = organizations.id)
  );
