
-- 1) Membership table
CREATE TABLE IF NOT EXISTS public.staff_stores (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);

GRANT SELECT ON public.staff_stores TO authenticated;
GRANT ALL ON public.staff_stores TO service_role;

ALTER TABLE public.staff_stores ENABLE ROW LEVEL SECURITY;

-- Staff can see membership rows; owners manage them.
CREATE POLICY "staff_stores read" ON public.staff_stores
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "staff_stores owner manage" ON public.staff_stores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

-- 2) Helper: is the user allowed to touch this store?
-- Owners implicitly cover all stores; other staff need an explicit membership row.
CREATE OR REPLACE FUNCTION public.is_staff_of_store(_uid uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL AND _store_id IS NOT NULL
    AND public.is_staff_any(_uid)
    AND (
      public.has_role(_uid, 'owner'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.staff_stores s
        WHERE s.user_id = _uid AND s.store_id = _store_id
      )
    )
$$;

-- Seed: put every current staff account (owner/admin/stock_staff/photo_staff)
-- into every existing store so today's behavior is preserved. New staff will
-- need to be added explicitly by an owner.
INSERT INTO public.staff_stores (user_id, store_id)
SELECT ur.user_id, s.id
  FROM public.user_roles ur
  CROSS JOIN public.rds_stores s
 WHERE ur.role IN ('owner','admin','stock_staff','photo_staff')
ON CONFLICT DO NOTHING;

-- 3) Rewrite policies to enforce per-store scoping.

-- rds_documents
DROP POLICY IF EXISTS "rds_documents staff all" ON public.rds_documents;
CREATE POLICY "rds_documents staff all" ON public.rds_documents
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_customers
DROP POLICY IF EXISTS "rds_customers staff all" ON public.rds_customers;
CREATE POLICY "rds_customers staff all" ON public.rds_customers
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_products
DROP POLICY IF EXISTS "rds_products staff all" ON public.rds_products;
CREATE POLICY "rds_products staff all" ON public.rds_products
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_categories
DROP POLICY IF EXISTS "rds_categories staff all" ON public.rds_categories;
CREATE POLICY "rds_categories staff all" ON public.rds_categories
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_units
DROP POLICY IF EXISTS "rds_units staff all" ON public.rds_units;
CREATE POLICY "rds_units staff all" ON public.rds_units
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_tax_rates
DROP POLICY IF EXISTS "rds_tax_rates staff all" ON public.rds_tax_rates;
CREATE POLICY "rds_tax_rates staff all" ON public.rds_tax_rates
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_payment_methods
DROP POLICY IF EXISTS "rds_payment_methods staff all" ON public.rds_payment_methods;
CREATE POLICY "rds_payment_methods staff all" ON public.rds_payment_methods
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_document_settings
DROP POLICY IF EXISTS "rds_document_settings staff all" ON public.rds_document_settings;
CREATE POLICY "rds_document_settings staff all" ON public.rds_document_settings
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_document_templates
DROP POLICY IF EXISTS "Staff manage doc templates" ON public.rds_document_templates;
CREATE POLICY "Staff manage doc templates" ON public.rds_document_templates
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_activity_logs
DROP POLICY IF EXISTS "rds_activity_logs staff read" ON public.rds_activity_logs;
DROP POLICY IF EXISTS "rds_activity_logs staff insert" ON public.rds_activity_logs;
CREATE POLICY "rds_activity_logs staff read" ON public.rds_activity_logs
  FOR SELECT TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id));
CREATE POLICY "rds_activity_logs staff insert" ON public.rds_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_stores  (id IS the store id)
DROP POLICY IF EXISTS "rds_stores staff all" ON public.rds_stores;
CREATE POLICY "rds_stores staff all" ON public.rds_stores
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), id));

-- rds_payments  (uses store_id column already)
DROP POLICY IF EXISTS "rds_payments staff all" ON public.rds_payments;
CREATE POLICY "rds_payments staff all" ON public.rds_payments
  FOR ALL TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_document_revisions  (has store_id already)
DROP POLICY IF EXISTS "Staff can view doc revisions" ON public.rds_document_revisions;
DROP POLICY IF EXISTS "Staff can insert doc revisions" ON public.rds_document_revisions;
CREATE POLICY "Staff can view doc revisions" ON public.rds_document_revisions
  FOR SELECT TO authenticated
  USING (public.is_staff_of_store(auth.uid(), store_id));
CREATE POLICY "Staff can insert doc revisions" ON public.rds_document_revisions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

-- rds_document_items  (only has document_id — scope through parent document)
DROP POLICY IF EXISTS "rds_document_items staff all" ON public.rds_document_items;
CREATE POLICY "rds_document_items staff all" ON public.rds_document_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rds_documents d
      WHERE d.id = document_id
        AND public.is_staff_of_store(auth.uid(), d.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rds_documents d
      WHERE d.id = document_id
        AND public.is_staff_of_store(auth.uid(), d.store_id)
    )
  );
