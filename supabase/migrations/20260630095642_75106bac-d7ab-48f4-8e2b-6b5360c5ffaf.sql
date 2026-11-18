DROP POLICY IF EXISTS product_shops_public_read ON public.product_shops;

CREATE POLICY product_shops_auth_read ON public.product_shops
  FOR SELECT
  TO authenticated
  USING (active = true);

REVOKE SELECT ON public.product_shops FROM anon;