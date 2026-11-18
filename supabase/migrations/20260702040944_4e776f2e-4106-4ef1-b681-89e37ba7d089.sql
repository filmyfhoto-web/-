-- Server-side duplicate FY-code guard.
-- The UNIQUE index on products.code already prevents duplicates, but the raw
-- 23505 error surfaces as an English "duplicate key value..." message. We wrap
-- it in a BEFORE INSERT/UPDATE trigger so:
--   1. Direct REST calls (bypassing the form) are still blocked.
--   2. The message is a friendly Thai string that the UI can display verbatim.
CREATE OR REPLACE FUNCTION public.products_check_code_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clash_name text;
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO clash_name
  FROM public.products
  WHERE code = NEW.code
    AND (TG_OP = 'INSERT' OR id <> NEW.id)
  LIMIT 1;

  IF clash_name IS NOT NULL THEN
    RAISE EXCEPTION 'รหัสสินค้า % ถูกใช้ไปแล้วโดย "%"', NEW.code, clash_name
      USING ERRCODE = 'unique_violation',
            HINT = 'duplicate_product_code';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_check_code_unique ON public.products;
CREATE TRIGGER trg_products_check_code_unique
BEFORE INSERT OR UPDATE OF code ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_check_code_unique();
