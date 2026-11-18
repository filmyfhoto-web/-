UPDATE public.myshop_product_mappings
SET myshop_variant_id = myshop_inventory_id::text,
    sync_status = 'mapped',
    last_error = NULL
WHERE (myshop_variant_id IS NULL OR myshop_variant_id = '')
  AND myshop_inventory_id IS NOT NULL;