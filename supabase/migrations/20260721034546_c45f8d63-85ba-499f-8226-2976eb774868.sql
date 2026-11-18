-- Phase 3B: Product Master schema hardening (additive)

-- 1. updated_at columns + triggers
ALTER TABLE public.product_units          ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.product_wholesale_tiers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.product_bundles         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS product_units_touch ON public.product_units;
CREATE TRIGGER product_units_touch BEFORE UPDATE ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS product_wholesale_tiers_touch ON public.product_wholesale_tiers;
CREATE TRIGGER product_wholesale_tiers_touch BEFORE UPDATE ON public.product_wholesale_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS product_bundles_touch ON public.product_bundles;
CREATE TRIGGER product_bundles_touch BEFORE UPDATE ON public.product_bundles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. New optional columns (additive; existing fields untouched)
ALTER TABLE public.product_bundles
  ADD COLUMN IF NOT EXISTS conversion_qty numeric;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_bundles_conversion_qty_check') THEN
    ALTER TABLE public.product_bundles
      ADD CONSTRAINT product_bundles_conversion_qty_check
      CHECK (conversion_qty IS NULL OR conversion_qty > 0);
  END IF;
END $$;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS price numeric;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_variants_price_check') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_price_check
      CHECK (price IS NULL OR price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_variants_price_override_check') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_price_override_check
      CHECK (price_override IS NULL OR price_override >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_variants_stock_check') THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_stock_check
      CHECK (stock >= 0);
  END IF;
END $$;

-- 3. Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS product_wholesale_tiers_product_idx
  ON public.product_wholesale_tiers(product_id);
CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS product_bundles_parent_idx
  ON public.product_bundles(parent_id);
CREATE INDEX IF NOT EXISTS product_bundles_child_idx
  ON public.product_bundles(child_id);

-- 4. Grants (RLS + existing policies via is_staff_any / can_edit_product / can_approve still gate access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_wholesale_tiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_bundles         TO authenticated;

GRANT ALL ON public.product_units          TO service_role;
GRANT ALL ON public.product_wholesale_tiers TO service_role;
GRANT ALL ON public.product_variants        TO service_role;
GRANT ALL ON public.product_bundles         TO service_role;