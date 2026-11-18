-- Phase 3B schema assertions (run in a transaction, rollback at end)
BEGIN;

-- product_units
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='product_units' AND column_name='updated_at'
) THEN 1 ELSE 0 END;

-- product_wholesale_tiers.updated_at
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='product_wholesale_tiers' AND column_name='updated_at'
) THEN 1 ELSE 0 END;

-- product_bundles.conversion_qty
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='product_bundles' AND column_name='conversion_qty'
) THEN 1 ELSE 0 END;

-- product_variants.price
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='product_variants' AND column_name='price'
) THEN 1 ELSE 0 END;

-- Grants to authenticated + service_role (via has_table_privilege to include inherited grants)
SELECT 1/CASE WHEN bool_and(
  has_table_privilege('authenticated', 'public.'||t, 'SELECT') AND
  has_table_privilege('authenticated', 'public.'||t, 'INSERT') AND
  has_table_privilege('authenticated', 'public.'||t, 'UPDATE') AND
  has_table_privilege('authenticated', 'public.'||t, 'DELETE') AND
  has_table_privilege('service_role',  'public.'||t, 'DELETE')
) THEN 1 ELSE 0 END
FROM unnest(ARRAY['product_units','product_wholesale_tiers','product_variants','product_bundles']) t;

-- Nonnegative check: inserting negative stock should fail
DO $$
DECLARE
  pid uuid;
BEGIN
  SELECT id INTO pid FROM public.products LIMIT 1;
  IF pid IS NULL THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.product_variants(product_id, sku, stock, price)
    VALUES (pid, 'test-neg-'||gen_random_uuid()::text, -1, 0);
    RAISE EXCEPTION 'expected stock>=0 check to fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.product_variants(product_id, sku, stock, price)
    VALUES (pid, 'test-negp-'||gen_random_uuid()::text, 0, -5);
    RAISE EXCEPTION 'expected price>=0 check to fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- RLS still enabled
SELECT 1/CASE WHEN (
  SELECT bool_and(relrowsecurity) FROM pg_class
  WHERE relname IN ('product_units','product_wholesale_tiers','product_variants','product_bundles')
) THEN 1 ELSE 0 END;

ROLLBACK;
