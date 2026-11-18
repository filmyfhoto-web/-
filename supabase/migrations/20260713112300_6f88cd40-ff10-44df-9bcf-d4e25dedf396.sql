
-- ============================================================
-- STEP 1: DROP existing rds-shaped film_* tables (order matters)
-- ============================================================
DROP TABLE IF EXISTS public.film_payments CASCADE;
DROP TABLE IF EXISTS public.film_pos_transactions CASCADE;
DROP TABLE IF EXISTS public.film_pos_sessions CASCADE;
DROP TABLE IF EXISTS public.film_document_items CASCADE;
DROP TABLE IF EXISTS public.film_document_revisions CASCADE;
DROP TABLE IF EXISTS public.film_documents CASCADE;
DROP TABLE IF EXISTS public.film_document_settings CASCADE;
DROP TABLE IF EXISTS public.film_document_templates CASCADE;
DROP TABLE IF EXISTS public.film_drafts CASCADE;
DROP TABLE IF EXISTS public.film_paper_withdrawals CASCADE;
DROP TABLE IF EXISTS public.film_job_requests CASCADE;
DROP TABLE IF EXISTS public.film_jobs CASCADE;
DROP TABLE IF EXISTS public.film_line_recipients CASCADE;
DROP TABLE IF EXISTS public.film_activity_logs CASCADE;
DROP TABLE IF EXISTS public.film_categories CASCADE;
DROP TABLE IF EXISTS public.film_products CASCADE;
DROP TABLE IF EXISTS public.film_customers CASCADE;
DROP TABLE IF EXISTS public.film_stores CASCADE;
DROP TABLE IF EXISTS public.film_settings CASCADE;
DROP TABLE IF EXISTS public.film_payment_methods CASCADE;
DROP TABLE IF EXISTS public.film_tax_rates CASCADE;
DROP TABLE IF EXISTS public.film_units CASCADE;

-- Drop the film_* RPC helpers that referenced the old schema
DROP FUNCTION IF EXISTS public.film_next_doc_no(text) CASCADE;
DROP FUNCTION IF EXISTS public.film_duplicate_document(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.film_apply_stock_movement() CASCADE;

-- ============================================================
-- STEP 2: Recreate film_* tables from FILM Shop original schema
-- ============================================================

-- customers
CREATE TABLE public.film_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  tax_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_customers TO authenticated;
GRANT ALL ON public.film_customers TO service_role;
ALTER TABLE public.film_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- employees
CREATE TABLE public.film_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position text NOT NULL,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_employees TO authenticated;
GRANT ALL ON public.film_employees TO service_role;
ALTER TABLE public.film_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_employees FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- invoices
CREATE TABLE public.film_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'unpaid',
  job_status text NOT NULL DEFAULT 'pending',
  is_draft boolean NOT NULL DEFAULT false,
  customer_id uuid REFERENCES public.film_customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  customer_tax_id text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  document_date date,
  due_date date,
  paid_at timestamptz,
  payment_method text,
  header_text text,
  notes text,
  reference_doc text,
  sales_person text,
  source_job_request_id uuid,
  created_via text NOT NULL DEFAULT 'manual',
  created_via_line_user_id text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_invoices_number_idx ON public.film_invoices(invoice_number);
CREATE INDEX film_invoices_customer_idx ON public.film_invoices(customer_id);
CREATE INDEX film_invoices_type_idx ON public.film_invoices(type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_invoices TO authenticated;
GRANT ALL ON public.film_invoices TO service_role;
ALTER TABLE public.film_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- transactions
CREATE TABLE public.film_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_id uuid REFERENCES public.film_invoices(id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_transactions TO authenticated;
GRANT ALL ON public.film_transactions TO service_role;
ALTER TABLE public.film_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pos_products
CREATE TABLE public.film_pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'ชิ้น',
  icon text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_pos_products TO authenticated;
GRANT ALL ON public.film_pos_products TO service_role;
ALTER TABLE public.film_pos_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_pos_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pos_receipts
CREATE TABLE public.film_pos_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_id uuid REFERENCES public.film_customers(id) ON DELETE SET NULL,
  customer_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'cash',
  payment_status text NOT NULL DEFAULT 'paid',
  cash_received numeric,
  change_amount numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_pos_receipts TO authenticated;
GRANT ALL ON public.film_pos_receipts TO service_role;
ALTER TABLE public.film_pos_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_pos_receipts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_advances
CREATE TABLE public.film_cash_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_type text NOT NULL DEFAULT 'employee',
  borrower_name text NOT NULL,
  employee_id uuid REFERENCES public.film_employees(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  expense_category text,
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  shift_id uuid,
  settled_shift_id uuid,
  notes text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_cash_advances TO authenticated;
GRANT ALL ON public.film_cash_advances TO service_role;
ALTER TABLE public.film_cash_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_cash_advances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_advance_repayments
CREATE TABLE public.film_cash_advance_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.film_cash_advances(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  repaid_at timestamptz NOT NULL DEFAULT now(),
  shift_id uuid,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_cash_advance_repayments TO authenticated;
GRANT ALL ON public.film_cash_advance_repayments TO service_role;
ALTER TABLE public.film_cash_advance_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_cash_advance_repayments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_drawer_shifts
CREATE TABLE public.film_cash_drawer_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open',
  opening_amount numeric NOT NULL DEFAULT 0,
  expected_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric,
  difference numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_cash_drawer_shifts TO authenticated;
GRANT ALL ON public.film_cash_drawer_shifts TO service_role;
ALTER TABLE public.film_cash_drawer_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_cash_drawer_shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_drawer_transactions
CREATE TABLE public.film_cash_drawer_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.film_cash_drawer_shifts(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  pos_receipt_id uuid REFERENCES public.film_pos_receipts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_cash_drawer_transactions TO authenticated;
GRANT ALL ON public.film_cash_drawer_transactions TO service_role;
ALTER TABLE public.film_cash_drawer_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_cash_drawer_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cash_drawer_audit
CREATE TABLE public.film_cash_drawer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  action text NOT NULL,
  field_changed text,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_cash_drawer_audit TO authenticated;
GRANT ALL ON public.film_cash_drawer_audit TO service_role;
ALTER TABLE public.film_cash_drawer_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_cash_drawer_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- daily_reports
CREATE TABLE public.film_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_daily_reports TO authenticated;
GRANT ALL ON public.film_daily_reports TO service_role;
ALTER TABLE public.film_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_daily_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- paper_withdrawals
CREATE TABLE public.film_paper_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_type text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'แผ่น',
  withdrawn_by text NOT NULL,
  withdrawn_at timestamptz NOT NULL DEFAULT now(),
  purpose text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_paper_withdrawals TO authenticated;
GRANT ALL ON public.film_paper_withdrawals TO service_role;
ALTER TABLE public.film_paper_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_paper_withdrawals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_requests
CREATE TABLE public.film_job_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text,
  description text,
  customer_name text NOT NULL,
  customer_phone text,
  quantity numeric,
  width numeric,
  length numeric,
  status text NOT NULL DEFAULT 'new',
  notes text,
  linked_invoice_id uuid REFERENCES public.film_invoices(id) ON DELETE SET NULL,
  linked_doc_type text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_job_requests TO authenticated;
GRANT ALL ON public.film_job_requests TO service_role;
ALTER TABLE public.film_job_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_job_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- shop_settings
CREATE TABLE public.film_shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT 'FILM SHOP',
  shop_address text NOT NULL DEFAULT '',
  shop_phone text NOT NULL DEFAULT '',
  shop_tax_id text NOT NULL DEFAULT '',
  shop_logo text,
  default_price_per_sqm numeric NOT NULL DEFAULT 0,
  product_pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_categories jsonb DEFAULT '[]'::jsonb,
  quotation_header_text text,
  receipt_header text,
  receipt_footer text,
  google_sheets_webhook_url text,
  google_sheets_auto_sync boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_shop_settings TO authenticated;
GRANT ALL ON public.film_shop_settings TO service_role;
ALTER TABLE public.film_shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_read" ON public.film_shop_settings FOR SELECT TO anon USING (true);
GRANT SELECT ON public.film_shop_settings TO anon;

-- line_notification_settings
CREATE TABLE public.film_line_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  include_doc_link boolean NOT NULL DEFAULT true,
  notify_cash_advance_created boolean NOT NULL DEFAULT true,
  notify_doc_created_invoice boolean NOT NULL DEFAULT true,
  notify_doc_created_quotation boolean NOT NULL DEFAULT true,
  notify_doc_created_receipt boolean NOT NULL DEFAULT true,
  notify_job_status_pending boolean NOT NULL DEFAULT true,
  notify_job_status_in_progress boolean NOT NULL DEFAULT true,
  notify_job_status_printing boolean NOT NULL DEFAULT true,
  notify_job_status_completed boolean NOT NULL DEFAULT true,
  notify_job_status_delivered boolean NOT NULL DEFAULT true,
  notify_payment_status_paid boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_line_notification_settings TO authenticated;
GRANT ALL ON public.film_line_notification_settings TO service_role;
ALTER TABLE public.film_line_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_line_notification_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- admin_line_links
CREATE TABLE public.film_admin_line_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  line_user_id text,
  display_name text,
  link_token text,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_admin_line_links TO authenticated;
GRANT ALL ON public.film_admin_line_links TO service_role;
ALTER TABLE public.film_admin_line_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_admin_line_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- payment_status_history
CREATE TABLE public.film_payment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL,
  doc_number text NOT NULL,
  doc_type text NOT NULL,
  status_from text,
  status_to text NOT NULL,
  changed_by uuid,
  changed_by_name text,
  notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_payment_status_history TO authenticated;
GRANT ALL ON public.film_payment_status_history TO service_role;
ALTER TABLE public.film_payment_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_payment_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_type_totals_archived
CREATE TABLE public.film_job_type_totals_archived (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_job_type_totals_archived TO authenticated;
GRANT ALL ON public.film_job_type_totals_archived TO service_role;
ALTER TABLE public.film_job_type_totals_archived ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON public.film_job_type_totals_archived FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed a default shop settings row so app doesn't error on first load
INSERT INTO public.film_shop_settings (shop_name, shop_address, shop_phone, shop_tax_id)
VALUES ('FILM SHOP', '', '', '')
ON CONFLICT DO NOTHING;

INSERT INTO public.film_line_notification_settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;
