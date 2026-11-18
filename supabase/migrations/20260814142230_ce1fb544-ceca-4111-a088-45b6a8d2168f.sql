CREATE UNIQUE INDEX IF NOT EXISTS myshop_product_mappings_unique_remote
  ON public.myshop_product_mappings (integration_id, myshop_product_id, myshop_variant_id)
  NULLS NOT DISTINCT;