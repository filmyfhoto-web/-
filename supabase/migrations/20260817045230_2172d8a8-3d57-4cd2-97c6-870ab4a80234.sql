CREATE OR REPLACE FUNCTION public.trg_stock_sync_enqueue_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    BEGIN
      IF TG_TABLE_NAME = 'products' THEN
        PERFORM public.stock_sync_enqueue(NEW.id, NULL);
      ELSE
        PERFORM public.stock_sync_enqueue(NEW.product_id, NEW.id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'stock_sync_enqueue failed: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS stock_sync_enqueue_after_product_update ON public.products;
CREATE TRIGGER stock_sync_enqueue_after_product_update
AFTER UPDATE OF stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_sync_enqueue_product();

DROP TRIGGER IF EXISTS stock_sync_enqueue_after_variant_update ON public.product_variants;
CREATE TRIGGER stock_sync_enqueue_after_variant_update
AFTER UPDATE OF stock ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.trg_stock_sync_enqueue_product();