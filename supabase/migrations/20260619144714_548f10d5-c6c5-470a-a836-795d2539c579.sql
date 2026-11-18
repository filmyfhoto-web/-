
ALTER VIEW public.products_public SET (security_invoker = true);

DROP POLICY IF EXISTS "auth read price groups" ON public.price_groups;

DROP POLICY IF EXISTS "public read active products" ON public.products;
CREATE POLICY "public read active products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (active = true OR is_staff(auth.uid()));
