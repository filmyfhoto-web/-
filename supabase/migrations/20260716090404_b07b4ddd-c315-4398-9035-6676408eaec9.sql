-- product_shops: scope policies to authenticated role only
DROP POLICY IF EXISTS product_shops_staff_all ON public.product_shops;
DROP POLICY IF EXISTS product_shops_staff_read ON public.product_shops;

CREATE POLICY product_shops_staff_all
  ON public.product_shops
  FOR ALL
  TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

CREATE POLICY product_shops_staff_read
  ON public.product_shops
  FOR SELECT
  TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id));

-- shop_promos: drop meaningless admin bypass from public read policy.
-- Admins retain full access via the existing "admin manage promos" policy.
DROP POLICY IF EXISTS "public read active promos" ON public.shop_promos;

CREATE POLICY "public read active promos"
  ON public.shop_promos
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);