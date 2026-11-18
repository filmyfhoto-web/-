
-- ============ STORES ============
CREATE TABLE public.rds_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tax_id text,
  phone text,
  address text,
  logo_url text,
  stamp_url text,
  signature_url text,
  default_vat_rate numeric NOT NULL DEFAULT 0,
  vat_enabled boolean NOT NULL DEFAULT false,
  google_sheet_id text,
  google_drive_folder_id text,
  footer_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_stores TO authenticated;
GRANT ALL ON public.rds_stores TO service_role;
ALTER TABLE public.rds_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_stores staff all" ON public.rds_stores FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_stores_updated BEFORE UPDATE ON public.rds_stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rds_stores (slug, name, default_vat_rate, vat_enabled) VALUES
  ('colorlab', 'นัฐภรณ์ คัลเลอร์แล็ป', 7, true),
  ('printing', 'นัฐภรณ์ การพิมพ์', 0, false);

-- ============ CUSTOMERS ============
CREATE TABLE public.rds_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  tax_id text,
  branch_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rds_customers_store_idx ON public.rds_customers(store_id);
CREATE INDEX rds_customers_name_idx ON public.rds_customers(store_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_customers TO authenticated;
GRANT ALL ON public.rds_customers TO service_role;
ALTER TABLE public.rds_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_customers staff all" ON public.rds_customers FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_customers_updated BEFORE UPDATE ON public.rds_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CATEGORIES ============
CREATE TABLE public.rds_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_categories TO authenticated;
GRANT ALL ON public.rds_categories TO service_role;
ALTER TABLE public.rds_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_categories staff all" ON public.rds_categories FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_categories_updated BEFORE UPDATE ON public.rds_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PRODUCTS ============
CREATE TABLE public.rds_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.rds_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  unit text,
  image_url text,
  stock_qty numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rds_products_store_idx ON public.rds_products(store_id);
CREATE INDEX rds_products_name_idx ON public.rds_products(store_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_products TO authenticated;
GRANT ALL ON public.rds_products TO service_role;
ALTER TABLE public.rds_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_products staff all" ON public.rds_products FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_products_updated BEFORE UPDATE ON public.rds_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DOCUMENTS ============
CREATE TABLE public.rds_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_no text NOT NULL,
  document_date date NOT NULL DEFAULT (now()::date),
  show_document_date boolean NOT NULL DEFAULT true,
  paper_size text NOT NULL DEFAULT 'A4',
  customer_id uuid REFERENCES public.rds_customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_address text,
  customer_tax_id text,
  customer_branch text,
  price_type text NOT NULL DEFAULT 'exclude_vat',
  vat_mode text NOT NULL DEFAULT 'none',
  vat_rate numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  amount_before_vat numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  withholding_tax_enabled boolean NOT NULL DEFAULT false,
  withholding_tax_rate numeric NOT NULL DEFAULT 0,
  withholding_tax_amount numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  net_total numeric NOT NULL DEFAULT 0,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'unpaid',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  pdf_url text,
  google_sheet_sync_status text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(store_id, document_type, document_no)
);
CREATE INDEX rds_documents_store_idx ON public.rds_documents(store_id, document_date DESC);
CREATE INDEX rds_documents_search_idx ON public.rds_documents(store_id, document_no);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_documents TO authenticated;
GRANT ALL ON public.rds_documents TO service_role;
ALTER TABLE public.rds_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_documents staff all" ON public.rds_documents FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_documents_updated BEFORE UPDATE ON public.rds_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ DOCUMENT ITEMS ============
CREATE TABLE public.rds_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.rds_documents(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.rds_products(id) ON DELETE SET NULL,
  item_order int NOT NULL DEFAULT 0,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  discount_percent numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rds_document_items_doc_idx ON public.rds_document_items(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_document_items TO authenticated;
GRANT ALL ON public.rds_document_items TO service_role;
ALTER TABLE public.rds_document_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_document_items staff all" ON public.rds_document_items FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_document_items_updated BEFORE UPDATE ON public.rds_document_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAYMENTS ============
CREATE TABLE public.rds_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.rds_documents(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_payments TO authenticated;
GRANT ALL ON public.rds_payments TO service_role;
ALTER TABLE public.rds_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_payments staff all" ON public.rds_payments FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));

-- ============ DOCUMENT SETTINGS ============
CREATE TABLE public.rds_document_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  title text NOT NULL,
  prefix text NOT NULL,
  running_format text NOT NULL DEFAULT '{prefix}-{yyyy}-{seq:0000}',
  next_number int NOT NULL DEFAULT 1,
  paper_size text NOT NULL DEFAULT 'A4',
  template_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, document_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_document_settings TO authenticated;
GRANT ALL ON public.rds_document_settings TO service_role;
ALTER TABLE public.rds_document_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_document_settings staff all" ON public.rds_document_settings FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_document_settings_updated BEFORE UPDATE ON public.rds_document_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed document settings per store
INSERT INTO public.rds_document_settings (store_id, document_type, title, prefix)
SELECT s.id, t.dtype, t.title, t.prefix FROM public.rds_stores s
CROSS JOIN (VALUES
  ('receipt','ใบเสร็จรับเงิน','RC'),
  ('delivery_order','ใบส่งของ','DO'),
  ('invoice','ใบแจ้งหนี้','INV'),
  ('quotation','ใบเสนอราคา','QT'),
  ('tax_invoice','ใบกำกับภาษี/ใบเสร็จรับเงิน','TAX')
) AS t(dtype, title, prefix);

-- ============ PAYMENT METHODS ============
CREATE TABLE public.rds_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_payment_methods TO authenticated;
GRANT ALL ON public.rds_payment_methods TO service_role;
ALTER TABLE public.rds_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_payment_methods staff all" ON public.rds_payment_methods FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_payment_methods_updated BEFORE UPDATE ON public.rds_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rds_payment_methods (store_id, name, sort_order)
SELECT s.id, m.name, m.ord FROM public.rds_stores s
CROSS JOIN (VALUES ('เงินสด',1),('โอนเงิน',2),('QR Payment',3),('บัตร',4),('เครดิต',5),('ค้างชำระ',6)) AS m(name, ord);

-- ============ UNITS ============
CREATE TABLE public.rds_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_units TO authenticated;
GRANT ALL ON public.rds_units TO service_role;
ALTER TABLE public.rds_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_units staff all" ON public.rds_units FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_units_updated BEFORE UPDATE ON public.rds_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rds_units (store_id, name)
SELECT s.id, u.name FROM public.rds_stores s
CROSS JOIN (VALUES ('ชิ้น'),('ชุด'),('แผ่น'),('ม้วน'),('กล่อง'),('อัน'),('เล่ม'),('แพ็ค')) AS u(name);

-- ============ TAX RATES ============
CREATE TABLE public.rds_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  rate numeric NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, rate)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_tax_rates TO authenticated;
GRANT ALL ON public.rds_tax_rates TO service_role;
ALTER TABLE public.rds_tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_tax_rates staff all" ON public.rds_tax_rates FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER rds_tax_rates_updated BEFORE UPDATE ON public.rds_tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rds_tax_rates (store_id, rate, label)
SELECT s.id, r.rate, r.label FROM public.rds_stores s
CROSS JOIN (VALUES (0,'0%'),(7,'7%'),(10,'10%')) AS r(rate, label);

-- ============ ACTIVITY LOGS ============
CREATE TABLE public.rds_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.rds_activity_logs TO authenticated;
GRANT ALL ON public.rds_activity_logs TO service_role;
ALTER TABLE public.rds_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rds_activity_logs staff read" ON public.rds_activity_logs FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));
CREATE POLICY "rds_activity_logs staff insert" ON public.rds_activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()));

-- ============ RPC: next document number ============
CREATE OR REPLACE FUNCTION public.rds_next_doc_no(p_store_id uuid, p_document_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_format text;
  v_seq int;
  v_year text := to_char(now(),'YYYY');
  v_month text := to_char(now(),'MM');
  v_result text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.rds_document_settings
     SET next_number = next_number + 1
   WHERE store_id = p_store_id AND document_type = p_document_type
  RETURNING prefix, running_format, next_number - 1 INTO v_prefix, v_format, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'document settings not found for % / %', p_store_id, p_document_type;
  END IF;

  v_result := replace(v_format, '{prefix}', v_prefix);
  v_result := replace(v_result, '{yyyy}', v_year);
  v_result := replace(v_result, '{mm}', v_month);
  v_result := regexp_replace(v_result, '\{seq:0+\}', lpad(v_seq::text, length((regexp_match(v_format,'\{seq:(0+)\}'))[1]), '0'));
  v_result := replace(v_result, '{seq}', v_seq::text);
  RETURN v_result;
END $$;
