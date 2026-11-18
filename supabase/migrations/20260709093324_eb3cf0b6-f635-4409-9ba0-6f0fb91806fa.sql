
-- =========================================================================
-- NATTAWORKS: add new store + module tables
-- =========================================================================

-- 1) Add store row
INSERT INTO public.rds_stores (slug, name, default_vat_rate, vat_enabled, brand_color)
VALUES ('nattaworks', 'นัฐภรณ์เวิร์กส์', 0, false, '#B57A16')
ON CONFLICT (slug) DO NOTHING;

-- Grant staff_stores access to every existing owner (single-owner shop, safe fallback)
INSERT INTO public.staff_stores (user_id, store_id)
SELECT ur.user_id, s.id
FROM public.user_roles ur
CROSS JOIN public.rds_stores s
WHERE ur.role = 'owner' AND s.slug = 'nattaworks'
ON CONFLICT DO NOTHING;

-- Helper: current user has access to this store
CREATE OR REPLACE FUNCTION public.nw_has_store_access(_store_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_staff_any(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.staff_stores ss
      WHERE ss.user_id = auth.uid() AND ss.store_id = _store_id
    );
$$;

-- =========================================================================
-- 2) nw_job_categories
-- =========================================================================
CREATE TABLE public.nw_job_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_job_categories TO authenticated;
GRANT ALL ON public.nw_job_categories TO service_role;
ALTER TABLE public.nw_job_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_job_categories store staff" ON public.nw_job_categories
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));
CREATE TRIGGER trg_nw_job_categories_updated BEFORE UPDATE ON public.nw_job_categories
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 3) nw_measurement_units
-- =========================================================================
CREATE TABLE public.nw_measurement_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  symbol text NOT NULL,
  kind text NOT NULL DEFAULT 'length' CHECK (kind IN ('length','area','piece','custom')),
  to_meter_factor numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_measurement_units TO authenticated;
GRANT ALL ON public.nw_measurement_units TO service_role;
ALTER TABLE public.nw_measurement_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_measurement_units store staff" ON public.nw_measurement_units
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));
CREATE TRIGGER trg_nw_measurement_units_updated BEFORE UPDATE ON public.nw_measurement_units
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 4) nw_settings
-- =========================================================================
CREATE TABLE public.nw_settings (
  store_id uuid PRIMARY KEY REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  doc_no_prefix text NOT NULL DEFAULT 'NAT',
  doc_no_seq int NOT NULL DEFAULT 0,
  doc_no_period text,
  doc_footer_text text,
  show_markup_default boolean NOT NULL DEFAULT false,
  show_internal_default boolean NOT NULL DEFAULT false,
  show_cash_default boolean NOT NULL DEFAULT true,
  show_book_default boolean NOT NULL DEFAULT false,
  brand_color text DEFAULT '#B57A16',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_settings TO authenticated;
GRANT ALL ON public.nw_settings TO service_role;
ALTER TABLE public.nw_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_settings store staff" ON public.nw_settings
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));
CREATE TRIGGER trg_nw_settings_updated BEFORE UPDATE ON public.nw_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 5) nw_work_orders
-- =========================================================================
CREATE TABLE public.nw_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  doc_no text,
  doc_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
  due_date date,
  customer_id uuid REFERENCES public.rds_customers(id) ON DELETE SET NULL,
  customer_name_snap text,
  customer_phone_snap text,
  job_title text,
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','to_produce','printing','delivered','cancelled')),
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  surcharge_total numeric NOT NULL DEFAULT 0,
  grand_total_billed numeric NOT NULL DEFAULT 0,
  nattaworks_revenue numeric NOT NULL DEFAULT 0,
  cash_total numeric NOT NULL DEFAULT 0,
  book_total numeric NOT NULL DEFAULT 0,
  sale_mode text NOT NULL DEFAULT 'cash' CHECK (sale_mode IN ('cash','book','both')),
  show_markup boolean NOT NULL DEFAULT false,
  show_internal_revenue boolean NOT NULL DEFAULT false,
  show_cash_price boolean NOT NULL DEFAULT true,
  show_book_price boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (store_id, doc_no)
);
CREATE INDEX nw_work_orders_store_status_idx ON public.nw_work_orders (store_id, status, deleted_at);
CREATE INDEX nw_work_orders_store_date_idx ON public.nw_work_orders (store_id, doc_date DESC);
CREATE INDEX nw_work_orders_store_customer_idx ON public.nw_work_orders (store_id, customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_work_orders TO authenticated;
GRANT ALL ON public.nw_work_orders TO service_role;
ALTER TABLE public.nw_work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_work_orders store staff" ON public.nw_work_orders
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));
CREATE TRIGGER trg_nw_work_orders_updated BEFORE UPDATE ON public.nw_work_orders
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 6) nw_work_order_items
-- =========================================================================
CREATE TABLE public.nw_work_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.nw_work_orders(id) ON DELETE CASCADE,
  seq int NOT NULL DEFAULT 1,
  category_id uuid REFERENCES public.nw_job_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  pricing_method text NOT NULL DEFAULT 'flat'
    CHECK (pricing_method IN ('area','length','per_piece','flat')),
  width numeric,
  length numeric,
  width_unit_id uuid REFERENCES public.nw_measurement_units(id) ON DELETE SET NULL,
  length_unit_id uuid REFERENCES public.nw_measurement_units(id) ON DELETE SET NULL,
  area_m2 numeric,
  price_unit text NOT NULL DEFAULT 'per_piece'
    CHECK (price_unit IN ('per_cm','per_m','per_m2','per_piece','custom')),
  unit_price numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 1,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  surcharge_percent numeric NOT NULL DEFAULT 0,
  line_total_billed numeric NOT NULL DEFAULT 0,
  line_revenue_internal numeric NOT NULL DEFAULT 0,
  cash_price numeric,
  book_price numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nw_work_order_items_wo_idx ON public.nw_work_order_items (work_order_id, seq);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_work_order_items TO authenticated;
GRANT ALL ON public.nw_work_order_items TO service_role;
ALTER TABLE public.nw_work_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_work_order_items via wo" ON public.nw_work_order_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.nw_work_orders wo
                 WHERE wo.id = work_order_id AND public.nw_has_store_access(wo.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nw_work_orders wo
                      WHERE wo.id = work_order_id AND public.nw_has_store_access(wo.store_id)));
CREATE TRIGGER trg_nw_work_order_items_updated BEFORE UPDATE ON public.nw_work_order_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 7) nw_customer_price_rules
-- =========================================================================
CREATE TABLE public.nw_customer_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.rds_customers(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.nw_job_categories(id) ON DELETE CASCADE,
  price_unit text NOT NULL DEFAULT 'per_piece',
  unit_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  surcharge_percent numeric NOT NULL DEFAULT 0,
  default_sale_mode text NOT NULL DEFAULT 'cash' CHECK (default_sale_mode IN ('cash','book','both')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, customer_id, category_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_customer_price_rules TO authenticated;
GRANT ALL ON public.nw_customer_price_rules TO service_role;
ALTER TABLE public.nw_customer_price_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_customer_price_rules store staff" ON public.nw_customer_price_rules
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));
CREATE TRIGGER trg_nw_customer_price_rules_updated BEFORE UPDATE ON public.nw_customer_price_rules
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- =========================================================================
-- 8) nw_status_history
-- =========================================================================
CREATE TABLE public.nw_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.nw_work_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);
CREATE INDEX nw_status_history_wo_idx ON public.nw_status_history (work_order_id, changed_at DESC);
GRANT SELECT, INSERT ON public.nw_status_history TO authenticated;
GRANT ALL ON public.nw_status_history TO service_role;
ALTER TABLE public.nw_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nw_status_history via wo" ON public.nw_status_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.nw_work_orders wo
                 WHERE wo.id = work_order_id AND public.nw_has_store_access(wo.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nw_work_orders wo
                      WHERE wo.id = work_order_id AND public.nw_has_store_access(wo.store_id)));

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION public.trg_nw_wo_status_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.nw_status_history(work_order_id, from_status, to_status, changed_by)
    VALUES (NEW.id, CASE WHEN TG_OP='UPDATE' THEN OLD.status END, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_nw_wo_status_history_ins AFTER INSERT ON public.nw_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_nw_wo_status_history();
CREATE TRIGGER trg_nw_wo_status_history_upd AFTER UPDATE OF status ON public.nw_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_nw_wo_status_history();

-- =========================================================================
-- 9) Doc-no allocator
-- =========================================================================
CREATE OR REPLACE FUNCTION public.nw_next_doc_no(p_store_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text;
  v_period text := to_char((now() AT TIME ZONE 'Asia/Bangkok'), 'YYYYMM');
  v_seq int;
BEGIN
  IF NOT public.nw_has_store_access(p_store_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.nw_settings(store_id) VALUES (p_store_id)
    ON CONFLICT (store_id) DO NOTHING;
  UPDATE public.nw_settings
     SET doc_no_seq = CASE WHEN doc_no_period = v_period THEN doc_no_seq + 1 ELSE 1 END,
         doc_no_period = v_period,
         updated_at = now()
   WHERE store_id = p_store_id
  RETURNING doc_no_seq, doc_no_prefix INTO v_seq, v_prefix;
  RETURN v_prefix || '-' || v_period || '-' || lpad(v_seq::text, 4, '0');
END $$;

-- =========================================================================
-- 10) Seed NATTAWORKS defaults
-- =========================================================================
DO $seed$
DECLARE v_store uuid;
BEGIN
  SELECT id INTO v_store FROM public.rds_stores WHERE slug = 'nattaworks';
  IF v_store IS NULL THEN RETURN; END IF;

  INSERT INTO public.nw_settings(store_id) VALUES (v_store)
    ON CONFLICT (store_id) DO NOTHING;

  INSERT INTO public.nw_job_categories(store_id, name, sort_order) VALUES
    (v_store, 'ไวนิล', 10),
    (v_store, 'สติ๊กเกอร์', 20),
    (v_store, 'โฟมบอร์ด', 30),
    (v_store, 'ตรายาง', 40),
    (v_store, 'ถ่ายเอกสาร', 50),
    (v_store, 'อัดภาพ', 60)
  ON CONFLICT (store_id, name) DO NOTHING;

  INSERT INTO public.nw_measurement_units(store_id, name, symbol, kind, to_meter_factor, sort_order) VALUES
    (v_store, 'เซนติเมตร', 'ซม.', 'length', 0.01, 10),
    (v_store, 'เมตร', 'ม.', 'length', 1, 20),
    (v_store, 'ตารางเมตร', 'ตร.ม.', 'area', 1, 30),
    (v_store, 'ชิ้น', 'ชิ้น', 'piece', 1, 40)
  ON CONFLICT (store_id, symbol) DO NOTHING;
END $seed$;
