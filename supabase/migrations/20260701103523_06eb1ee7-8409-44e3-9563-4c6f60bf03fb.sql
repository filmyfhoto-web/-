
-- Sequence สำหรับรหัสสินค้า FY-series (ต่อจาก FY00473)
CREATE SEQUENCE IF NOT EXISTS public.products_fy_seq START WITH 474 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;
GRANT USAGE, SELECT ON SEQUENCE public.products_fy_seq TO authenticated, service_role;

-- คืนรหัสถัดไปแบบขยับ sequence
CREATE OR REPLACE FUNCTION public.next_fy_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'FY' || lpad(nextval('public.products_fy_seq')::text, 5, '0');
$$;
GRANT EXECUTE ON FUNCTION public.next_fy_code() TO authenticated, service_role;

-- ดูรหัสถัดไป (ไม่ขยับ sequence — ใช้แค่ preview)
CREATE OR REPLACE FUNCTION public.peek_next_fy_code()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'FY' || lpad(
    GREATEST(
      (SELECT last_value + CASE WHEN is_called THEN 1 ELSE 0 END FROM public.products_fy_seq),
      474
    )::text,
    5, '0'
  );
$$;
GRANT EXECUTE ON FUNCTION public.peek_next_fy_code() TO authenticated, service_role;

-- Trigger: เติม code อัตโนมัติเมื่อว่าง หรือเป็น SKU-xxx (default เดิมของ frontend)
CREATE OR REPLACE FUNCTION public.products_auto_fy_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL
     OR btrim(NEW.code) = ''
     OR NEW.code LIKE 'SKU-%'
  THEN
    NEW.code := public.next_fy_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_auto_fy_code ON public.products;
CREATE TRIGGER trg_products_auto_fy_code
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_auto_fy_code();

-- ให้แน่ใจว่า sequence นำหน้าข้อมูลเดิม (กันชนกรณีมี FY เลขสูงกว่า 473 อยู่แล้ว)
DO $$
DECLARE
  max_n int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '^FY0*', ''), '')::int), 473)
    INTO max_n
    FROM public.products
    WHERE code ~ '^FY[0-9]+$';
  IF max_n >= 474 THEN
    PERFORM setval('public.products_fy_seq', max_n + 1, false);
  END IF;
END $$;
