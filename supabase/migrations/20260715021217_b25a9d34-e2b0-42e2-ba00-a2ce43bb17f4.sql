DROP POLICY IF EXISTS product_shops_staff_all ON public.product_shops;
DROP POLICY IF EXISTS product_shops_staff_read ON public.product_shops;

CREATE POLICY product_shops_staff_read ON public.product_shops
  FOR SELECT
  USING (public.is_staff_of_store(auth.uid(), store_id));

CREATE POLICY product_shops_staff_all ON public.product_shops
  FOR ALL
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));