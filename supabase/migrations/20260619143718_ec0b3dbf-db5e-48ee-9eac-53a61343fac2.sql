
-- 1) price_groups: เพิ่ม markup_percent, is_custom, sort_order
ALTER TABLE public.price_groups
  ADD COLUMN IF NOT EXISTS markup_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- ให้ authenticated read price_groups ได้ (ลูกค้าต้องรู้ markup ของกลุ่มตัวเอง)
DROP POLICY IF EXISTS "auth read price groups" ON public.price_groups;
CREATE POLICY "auth read price groups" ON public.price_groups FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.price_groups TO authenticated;

-- 2) Seed กลุ่มมาตรฐาน (idempotent)
INSERT INTO public.price_groups (name, markup_percent, is_custom, sort_order)
SELECT v.name, v.mp, v.cu, v.so FROM (VALUES
  ('ลูกค้าประจำ',     0::numeric, false, 10),
  ('โรงเรียน',         10::numeric, false, 20),
  ('ตัวแทนจำหน่าย',   10::numeric, false, 30),
  ('สำนักงาน',         15::numeric, false, 40),
  ('ลูกค้าทั่วไป',     20::numeric, false, 50),
  ('หน่วยงานพิเศษ',   0::numeric,  true,  60)
) AS v(name, mp, cu, so)
WHERE NOT EXISTS (SELECT 1 FROM public.price_groups g WHERE g.name = v.name);

-- 3) price_history (audit)
CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('cost','group','customer','standard')),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ref_id uuid,
  old_price numeric,
  new_price numeric,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.price_history TO authenticated;
GRANT ALL ON public.price_history TO service_role;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read price history" ON public.price_history;
CREATE POLICY "staff read price history" ON public.price_history FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "system insert price history" ON public.price_history;
CREATE POLICY "system insert price history" ON public.price_history FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_price_history_product ON public.price_history(product_id, changed_at DESC);

-- 4) Trigger functions
CREATE OR REPLACE FUNCTION public.trg_log_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('cost', NEW.product_id, NULL, NULL, NEW.cost_price, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('cost', NEW.product_id, NULL, OLD.cost_price, NEW.cost_price, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_product_costs_audit ON public.product_costs;
CREATE TRIGGER trg_product_costs_audit AFTER INSERT OR UPDATE ON public.product_costs
FOR EACH ROW EXECUTE FUNCTION public.trg_log_cost();

CREATE OR REPLACE FUNCTION public.trg_log_group_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('group', NEW.product_id, NEW.price_group_id, NULL, NEW.price, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('group', NEW.product_id, NEW.price_group_id, OLD.price, NEW.price, auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('group', OLD.product_id, OLD.price_group_id, OLD.price, NULL, auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_group_prices_audit ON public.group_prices;
CREATE TRIGGER trg_group_prices_audit AFTER INSERT OR UPDATE OR DELETE ON public.group_prices
FOR EACH ROW EXECUTE FUNCTION public.trg_log_group_price();

CREATE OR REPLACE FUNCTION public.trg_log_customer_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('customer', NEW.product_id, NEW.organization_id, NULL, NEW.price, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('customer', NEW.product_id, NEW.organization_id, OLD.price, NEW.price, auth.uid());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('customer', OLD.product_id, OLD.organization_id, OLD.price, NULL, auth.uid());
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_customer_prices_audit ON public.customer_prices;
CREATE TRIGGER trg_customer_prices_audit AFTER INSERT OR UPDATE OR DELETE ON public.customer_prices
FOR EACH ROW EXECUTE FUNCTION public.trg_log_customer_price();

CREATE OR REPLACE FUNCTION public.trg_log_standard_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.standard_price IS DISTINCT FROM OLD.standard_price THEN
    INSERT INTO public.price_history(scope, product_id, ref_id, old_price, new_price, changed_by)
    VALUES ('standard', NEW.id, NULL, OLD.standard_price, NEW.standard_price, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_products_standard_audit ON public.products;
CREATE TRIGGER trg_products_standard_audit AFTER UPDATE OF standard_price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_log_standard_price();

-- 5) RPC: get_my_prices — คืนราคาเดียวที่ลูกค้าจะเห็น
CREATE OR REPLACE FUNCTION public.get_my_prices(p_product_ids uuid[])
RETURNS TABLE(product_id uuid, price numeric, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_group uuid;
  v_markup numeric;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id = v_uid;
  IF v_org IS NOT NULL THEN
    SELECT o.price_group_id INTO v_group FROM public.organizations o WHERE o.id = v_org;
  END IF;
  IF v_group IS NOT NULL THEN
    SELECT g.markup_percent INTO v_markup FROM public.price_groups g WHERE g.id = v_group;
  END IF;

  RETURN QUERY
  WITH ids AS (SELECT unnest(p_product_ids) AS pid)
  SELECT
    ids.pid AS product_id,
    COALESCE(
      cp.price,
      gp.price,
      CASE WHEN pc.cost_price IS NOT NULL AND v_markup IS NOT NULL
           THEN round(pc.cost_price * (1 + v_markup/100.0), 2) END,
      CASE WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 THEN pr.standard_price END
    ) AS price,
    CASE
      WHEN cp.price IS NOT NULL THEN 'customer'
      WHEN gp.price IS NOT NULL THEN 'group'
      WHEN pc.cost_price IS NOT NULL AND v_markup IS NOT NULL THEN 'group'
      WHEN pr.standard_price IS NOT NULL AND pr.standard_price > 0 THEN 'standard'
      ELSE 'pending'
    END AS source
  FROM ids
  LEFT JOIN public.products pr ON pr.id = ids.pid
  LEFT JOIN public.customer_prices cp ON cp.product_id = ids.pid AND cp.organization_id = v_org
  LEFT JOIN public.group_prices gp ON gp.product_id = ids.pid AND gp.price_group_id = v_group
  LEFT JOIN public.product_costs pc ON pc.product_id = ids.pid;
END $$;
GRANT EXECUTE ON FUNCTION public.get_my_prices(uuid[]) TO authenticated;

-- 6) RPC: admin_get_price_matrix — staff เห็นทุกระดับ
CREATE OR REPLACE FUNCTION public.admin_get_price_matrix(p_search text DEFAULT '', p_category uuid DEFAULT NULL, p_limit int DEFAULT 200, p_offset int DEFAULT 0)
RETURNS TABLE(
  id uuid, code text, name text, unit text, category_id uuid, stock numeric,
  cost_price numeric, standard_price numeric,
  group_prices jsonb,     -- {group_id: {markup, price, override_bool}}
  customer_price_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    p.id, p.code, p.name, p.unit, p.category_id, p.stock,
    pc.cost_price, p.standard_price,
    (
      SELECT jsonb_object_agg(g.id::text, jsonb_build_object(
        'markup', g.markup_percent,
        'name', g.name,
        'override', gp.price,
        'price', COALESCE(gp.price, CASE WHEN pc.cost_price IS NOT NULL THEN round(pc.cost_price * (1 + g.markup_percent/100.0), 2) END)
      ))
      FROM public.price_groups g
      LEFT JOIN public.group_prices gp ON gp.price_group_id = g.id AND gp.product_id = p.id
    ) AS group_prices,
    (SELECT count(*)::int FROM public.customer_prices cp WHERE cp.product_id = p.id) AS customer_price_count
  FROM public.products p
  LEFT JOIN public.product_costs pc ON pc.product_id = p.id
  WHERE p.active = true
    AND (p_category IS NULL OR p.category_id = p_category)
    AND (coalesce(p_search,'') = '' OR p.name ILIKE '%'||p_search||'%' OR p.code ILIKE '%'||p_search||'%')
  ORDER BY p.name
  LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_get_price_matrix(text, uuid, int, int) TO authenticated;

-- 7) Setter RPCs (staff)
CREATE OR REPLACE FUNCTION public.admin_set_cost(p_product_id uuid, p_cost numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.product_costs(product_id, cost_price) VALUES (p_product_id, p_cost)
  ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_cost(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_group_price(p_product_id uuid, p_group_id uuid, p_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_price IS NULL THEN
    DELETE FROM public.group_prices WHERE product_id = p_product_id AND price_group_id = p_group_id;
  ELSE
    INSERT INTO public.group_prices(product_id, price_group_id, price)
    VALUES (p_product_id, p_group_id, p_price)
    ON CONFLICT (price_group_id, product_id) DO UPDATE SET price = EXCLUDED.price;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_group_price(uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_customer_price(p_product_id uuid, p_org_id uuid, p_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_price IS NULL THEN
    DELETE FROM public.customer_prices WHERE product_id = p_product_id AND organization_id = p_org_id;
  ELSE
    INSERT INTO public.customer_prices(product_id, organization_id, price)
    VALUES (p_product_id, p_org_id, p_price)
    ON CONFLICT (organization_id, product_id) DO UPDATE SET price = EXCLUDED.price;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_price(uuid, uuid, numeric) TO authenticated;
