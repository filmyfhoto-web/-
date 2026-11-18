
-- Multi-shop product support: link one product to one or many shops (rds_stores)
-- Existing rds_products read-model is kept; this new table is the source of truth for
-- which shops carry the product and per-shop overrides.

CREATE TABLE IF NOT EXISTS public.product_shops (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id   uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  price          numeric,
  stock          numeric,
  barcode        text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_product_shops_store ON public.product_shops(store_id);
CREATE INDEX IF NOT EXISTS idx_product_shops_active ON public.product_shops(store_id, active);

GRANT SELECT ON public.product_shops TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_shops TO authenticated;
GRANT ALL ON public.product_shops TO service_role;

ALTER TABLE public.product_shops ENABLE ROW LEVEL SECURITY;

-- anonymous & customers may read shop mappings for active products
CREATE POLICY "product_shops_public_read"
  ON public.product_shops FOR SELECT
  USING (active = true);

-- staff full management
CREATE POLICY "product_shops_staff_all"
  ON public.product_shops FOR ALL
  TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

-- update timestamp trigger
DROP TRIGGER IF EXISTS trg_product_shops_updated_at ON public.product_shops;
CREATE TRIGGER trg_product_shops_updated_at
  BEFORE UPDATE ON public.product_shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill: every existing product gets BOTH shops by default (idempotent)
INSERT INTO public.product_shops (product_id, store_id, price, stock, barcode, active)
SELECT p.id, s.id, p.standard_price, p.stock, p.barcode, COALESCE(p.active, true)
FROM public.products p
CROSS JOIN public.rds_stores s
ON CONFLICT (product_id, store_id) DO NOTHING;

-- Helper RPC: replace the set of shops a product belongs to
CREATE OR REPLACE FUNCTION public.admin_set_product_shops(
  p_product_id uuid,
  p_store_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_store_ids IS NULL OR array_length(p_store_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'at least one shop is required';
  END IF;

  -- remove rows for shops no longer selected
  DELETE FROM public.product_shops
   WHERE product_id = p_product_id
     AND NOT (store_id = ANY(p_store_ids));

  -- add new ones (carry product defaults)
  INSERT INTO public.product_shops (product_id, store_id, price, stock, barcode, active)
  SELECT p_product_id, sid, p.standard_price, p.stock, p.barcode, COALESCE(p.active,true)
  FROM unnest(p_store_ids) AS sid
  CROSS JOIN public.products p
  WHERE p.id = p_product_id
  ON CONFLICT (product_id, store_id) DO UPDATE
    SET active = true, updated_at = now();

  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'product_set_shops', 'product', p_product_id,
          jsonb_build_object('store_ids', p_store_ids));
END;
$$;

-- Convenience view: list shops per product (id + name)
CREATE OR REPLACE VIEW public.product_shops_view AS
SELECT ps.product_id,
       ps.store_id,
       s.name AS store_name,
       ps.price, ps.stock, ps.barcode, ps.active,
       ps.updated_at
FROM public.product_shops ps
JOIN public.rds_stores s ON s.id = ps.store_id;

GRANT SELECT ON public.product_shops_view TO anon, authenticated;
