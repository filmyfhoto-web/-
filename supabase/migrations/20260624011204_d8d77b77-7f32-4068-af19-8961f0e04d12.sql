
DROP INDEX IF EXISTS public.rds_products_store_sku_uk;
ALTER TABLE public.rds_products
  ADD CONSTRAINT rds_products_store_sku_uk UNIQUE (store_id, sku);

CREATE OR REPLACE FUNCTION public.trg_products_sync_to_rds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_cat uuid;
  v_cat_name text;
BEGIN
  IF NEW.code IS NULL OR length(btrim(NEW.code)) = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO v_cat_name FROM public.categories WHERE id = NEW.category_id;
  END IF;

  FOR s IN SELECT id FROM public.rds_stores LOOP
    v_cat := NULL;
    IF v_cat_name IS NOT NULL THEN
      SELECT id INTO v_cat FROM public.rds_categories
        WHERE store_id = s.id AND name = v_cat_name LIMIT 1;
      IF v_cat IS NULL THEN
        INSERT INTO public.rds_categories(store_id, name)
        VALUES (s.id, v_cat_name)
        RETURNING id INTO v_cat;
      END IF;
    END IF;

    INSERT INTO public.rds_products(
      store_id, category_id, name, sku, price, unit, image_url, stock_qty, is_active
    ) VALUES (
      s.id, v_cat, NEW.name, NEW.code,
      COALESCE(NEW.standard_price, 0), NEW.unit, NEW.image_url,
      COALESCE(NEW.stock, 0), COALESCE(NEW.active, true)
    )
    ON CONFLICT (store_id, sku) DO UPDATE
      SET name = EXCLUDED.name,
          category_id = COALESCE(EXCLUDED.category_id, public.rds_products.category_id),
          price = EXCLUDED.price,
          unit = EXCLUDED.unit,
          image_url = EXCLUDED.image_url,
          is_active = EXCLUDED.is_active,
          updated_at = now();
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_sync_to_rds ON public.products;
CREATE TRIGGER products_sync_to_rds
AFTER INSERT OR UPDATE OF name, code, unit, standard_price, image_url, active, category_id, stock
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_products_sync_to_rds();

-- Backfill
DO $$
DECLARE p record; s record; v_cat uuid; v_cat_name text;
BEGIN
  FOR p IN SELECT * FROM public.products WHERE code IS NOT NULL AND length(btrim(code)) > 0 LOOP
    v_cat_name := NULL;
    IF p.category_id IS NOT NULL THEN
      SELECT name INTO v_cat_name FROM public.categories WHERE id = p.category_id;
    END IF;
    FOR s IN SELECT id FROM public.rds_stores LOOP
      v_cat := NULL;
      IF v_cat_name IS NOT NULL THEN
        SELECT id INTO v_cat FROM public.rds_categories
          WHERE store_id = s.id AND name = v_cat_name LIMIT 1;
        IF v_cat IS NULL THEN
          INSERT INTO public.rds_categories(store_id, name) VALUES (s.id, v_cat_name)
          RETURNING id INTO v_cat;
        END IF;
      END IF;
      INSERT INTO public.rds_products(
        store_id, category_id, name, sku, price, unit, image_url, stock_qty, is_active
      ) VALUES (
        s.id, v_cat, p.name, p.code,
        COALESCE(p.standard_price, 0), p.unit, p.image_url,
        COALESCE(p.stock, 0), COALESCE(p.active, true)
      )
      ON CONFLICT (store_id, sku) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
