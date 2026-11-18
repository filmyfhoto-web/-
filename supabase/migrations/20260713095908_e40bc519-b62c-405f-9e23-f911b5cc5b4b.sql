
-- Phase 1: FILM SHOP database (film_* clone of rds_* + extras)

-- 1) Clone 15 rds_* tables to film_* using LIKE INCLUDING ALL (copies columns/defaults/not null/checks/indexes/pk)
CREATE TABLE public.film_stores             (LIKE public.rds_stores             INCLUDING ALL);
CREATE TABLE public.film_categories         (LIKE public.rds_categories         INCLUDING ALL);
CREATE TABLE public.film_customers          (LIKE public.rds_customers          INCLUDING ALL);
CREATE TABLE public.film_units              (LIKE public.rds_units              INCLUDING ALL);
CREATE TABLE public.film_tax_rates          (LIKE public.rds_tax_rates          INCLUDING ALL);
CREATE TABLE public.film_products           (LIKE public.rds_products           INCLUDING ALL);
CREATE TABLE public.film_documents          (LIKE public.rds_documents          INCLUDING ALL);
CREATE TABLE public.film_document_items     (LIKE public.rds_document_items     INCLUDING ALL);
CREATE TABLE public.film_document_revisions (LIKE public.rds_document_revisions INCLUDING ALL);
CREATE TABLE public.film_document_settings  (LIKE public.rds_document_settings  INCLUDING ALL);
CREATE TABLE public.film_document_templates (LIKE public.rds_document_templates INCLUDING ALL);
CREATE TABLE public.film_payment_methods    (LIKE public.rds_payment_methods    INCLUDING ALL);
CREATE TABLE public.film_payments           (LIKE public.rds_payments           INCLUDING ALL);
CREATE TABLE public.film_drafts             (LIKE public.rds_drafts             INCLUDING ALL);
CREATE TABLE public.film_activity_logs      (LIKE public.rds_activity_logs      INCLUDING ALL);

-- 2) Foreign keys → film_stores (LIKE doesn't copy FKs)
ALTER TABLE public.film_categories         ADD CONSTRAINT film_categories_store_id_fkey         FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_customers          ADD CONSTRAINT film_customers_store_id_fkey          FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_units              ADD CONSTRAINT film_units_store_id_fkey              FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_tax_rates          ADD CONSTRAINT film_tax_rates_store_id_fkey          FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_products           ADD CONSTRAINT film_products_store_id_fkey           FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_documents          ADD CONSTRAINT film_documents_store_id_fkey          FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_document_revisions ADD CONSTRAINT film_document_revisions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_document_settings  ADD CONSTRAINT film_document_settings_store_id_fkey  FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_document_templates ADD CONSTRAINT film_document_templates_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_payment_methods    ADD CONSTRAINT film_payment_methods_store_id_fkey    FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_payments           ADD CONSTRAINT film_payments_store_id_fkey           FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;
ALTER TABLE public.film_activity_logs      ADD CONSTRAINT film_activity_logs_store_id_fkey      FOREIGN KEY (store_id) REFERENCES public.film_stores(id) ON DELETE CASCADE;

-- 3) Extra film-only tables
CREATE TABLE public.film_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE UNIQUE,
  shop_name text,
  shop_address text,
  shop_phone text,
  shop_tax_id text,
  logo_url text,
  invoice_header text,
  invoice_footer text,
  receipt_paper text NOT NULL DEFAULT '80mm',
  line_channel_id text,
  line_notify_enabled boolean NOT NULL DEFAULT false,
  google_sheet_url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.film_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.film_documents(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.film_customers(id) ON DELETE SET NULL,
  job_no text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  notes text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_jobs_store_id_idx ON public.film_jobs(store_id);
CREATE INDEX film_jobs_status_idx ON public.film_jobs(status);
CREATE INDEX film_jobs_document_id_idx ON public.film_jobs(document_id);

CREATE TABLE public.film_job_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'line',
  line_user_id text,
  customer_name text,
  customer_phone text,
  message text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new',
  converted_job_id uuid REFERENCES public.film_jobs(id) ON DELETE SET NULL,
  converted_document_id uuid REFERENCES public.film_documents(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_job_requests_store_id_idx ON public.film_job_requests(store_id);
CREATE INDEX film_job_requests_status_idx ON public.film_job_requests(status);

CREATE TABLE public.film_pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric NOT NULL DEFAULT 0,
  closed_by uuid,
  closed_at timestamptz,
  closing_cash numeric,
  expected_cash numeric,
  cash_diff numeric,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_pos_sessions_store_id_idx ON public.film_pos_sessions(store_id);

CREATE TABLE public.film_pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.film_pos_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount numeric NOT NULL,
  reason text,
  ref_document_id uuid REFERENCES public.film_documents(id) ON DELETE SET NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_pos_transactions_session_id_idx ON public.film_pos_transactions(session_id);

CREATE TABLE public.film_paper_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  withdrawn_by uuid NOT NULL,
  paper_type text NOT NULL,
  quantity numeric NOT NULL,
  unit text NOT NULL DEFAULT 'sheet',
  purpose text,
  ref_job_id uuid REFERENCES public.film_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX film_paper_withdrawals_store_id_idx ON public.film_paper_withdrawals(store_id);

CREATE TABLE public.film_line_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.film_stores(id) ON DELETE CASCADE,
  line_user_id text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'staff',
  notify_new_doc boolean NOT NULL DEFAULT true,
  notify_job_status boolean NOT NULL DEFAULT true,
  notify_job_request boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, line_user_id)
);

-- 4) GRANTs (before RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.film_stores, public.film_categories, public.film_customers, public.film_units,
  public.film_tax_rates, public.film_products, public.film_documents, public.film_document_items,
  public.film_document_revisions, public.film_document_settings, public.film_document_templates,
  public.film_payment_methods, public.film_payments, public.film_drafts, public.film_activity_logs,
  public.film_settings, public.film_jobs, public.film_job_requests, public.film_pos_sessions,
  public.film_pos_transactions, public.film_paper_withdrawals, public.film_line_recipients
TO authenticated;

GRANT ALL ON
  public.film_stores, public.film_categories, public.film_customers, public.film_units,
  public.film_tax_rates, public.film_products, public.film_documents, public.film_document_items,
  public.film_document_revisions, public.film_document_settings, public.film_document_templates,
  public.film_payment_methods, public.film_payments, public.film_drafts, public.film_activity_logs,
  public.film_settings, public.film_jobs, public.film_job_requests, public.film_pos_sessions,
  public.film_pos_transactions, public.film_paper_withdrawals, public.film_line_recipients
TO service_role;

-- 5) Enable RLS + policies (staff-of-store guard, matches rds_* pattern)
ALTER TABLE public.film_stores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_units              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_tax_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_document_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_document_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_payment_methods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_drafts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_job_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_pos_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_pos_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_paper_withdrawals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_line_recipients    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "film_stores staff all" ON public.film_stores
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), id));

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'film_categories','film_customers','film_units','film_tax_rates','film_products',
    'film_documents','film_document_revisions','film_document_settings','film_document_templates',
    'film_payment_methods','film_payments','film_drafts','film_activity_logs',
    'film_settings','film_jobs','film_job_requests','film_pos_sessions',
    'film_paper_withdrawals','film_line_recipients'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "%1$s staff all" ON public.%1$s FOR ALL TO authenticated USING (public.is_staff_of_store(auth.uid(), store_id)) WITH CHECK (public.is_staff_of_store(auth.uid(), store_id))',
      t
    );
  END LOOP;
END $$;

-- film_document_items joins to documents (no store_id column) — guard through parent doc
CREATE POLICY "film_document_items staff all" ON public.film_document_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.film_documents d WHERE d.id = document_id AND public.is_staff_of_store(auth.uid(), d.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.film_documents d WHERE d.id = document_id AND public.is_staff_of_store(auth.uid(), d.store_id)));

-- film_pos_transactions similarly guarded via session
CREATE POLICY "film_pos_transactions staff all" ON public.film_pos_transactions
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- 6) updated_at triggers
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'film_stores','film_categories','film_customers','film_units','film_tax_rates','film_products',
    'film_documents','film_document_items','film_document_revisions','film_document_settings',
    'film_document_templates','film_payment_methods','film_payments','film_drafts',
    'film_settings','film_jobs','film_job_requests','film_pos_sessions','film_line_recipients'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %1$s_updated BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;

-- 7) Seed the FILM SHOP store row + default settings
INSERT INTO public.film_stores (slug, name, default_vat_rate, vat_enabled)
VALUES ('film', 'FILM SHOP', 0, false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.film_settings (store_id, shop_name)
SELECT id, 'FILM SHOP' FROM public.film_stores WHERE slug = 'film'
ON CONFLICT (store_id) DO NOTHING;
