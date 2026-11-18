CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===== rds_documents =====
DROP POLICY IF EXISTS "rds_documents staff all" ON public.rds_documents;
CREATE POLICY "rds_documents staff all" ON public.rds_documents
FOR ALL
USING (
  (SELECT auth.uid()) IS NOT NULL AND store_id IS NOT NULL
  AND (SELECT public.is_staff_any((SELECT auth.uid())))
  AND (
    (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
    OR store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
  )
)
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL AND store_id IS NOT NULL
  AND (SELECT public.is_staff_any((SELECT auth.uid())))
  AND (
    (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
    OR store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "customer read own documents" ON public.rds_documents;
CREATE POLICY "customer read own documents" ON public.rds_documents
FOR SELECT
USING (
  (SELECT public.is_staff_any((SELECT auth.uid())))
  OR assigned_to = (SELECT auth.uid())
  OR public.customer_owns_document(id)
);

-- ===== rds_document_items =====
DROP POLICY IF EXISTS "rds_document_items staff all" ON public.rds_document_items;
CREATE POLICY "rds_document_items staff all" ON public.rds_document_items
FOR ALL
USING (
  document_id IN (
    SELECT d.id FROM public.rds_documents d
    WHERE (SELECT public.is_staff_any((SELECT auth.uid())))
      AND (
        (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
        OR d.store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
      )
  )
)
WITH CHECK (
  document_id IN (
    SELECT d.id FROM public.rds_documents d
    WHERE (SELECT public.is_staff_any((SELECT auth.uid())))
      AND (
        (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
        OR d.store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
      )
  )
);

DROP POLICY IF EXISTS "customer read own document items" ON public.rds_document_items;
CREATE POLICY "customer read own document items" ON public.rds_document_items
FOR SELECT
USING (
  (SELECT public.is_staff_any((SELECT auth.uid())))
  OR public.customer_owns_document(document_id)
);

-- ===== rds_products =====
DROP POLICY IF EXISTS "rds_products staff all" ON public.rds_products;
CREATE POLICY "rds_products staff all" ON public.rds_products
FOR ALL
USING (
  (SELECT auth.uid()) IS NOT NULL AND store_id IS NOT NULL
  AND (SELECT public.is_staff_any((SELECT auth.uid())))
  AND (
    (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
    OR store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
  )
)
WITH CHECK (
  (SELECT auth.uid()) IS NOT NULL AND store_id IS NOT NULL
  AND (SELECT public.is_staff_any((SELECT auth.uid())))
  AND (
    (SELECT public.has_role((SELECT auth.uid()), 'owner'::app_role))
    OR store_id IN (SELECT s.store_id FROM public.staff_stores s WHERE s.user_id = (SELECT auth.uid()))
  )
);

CREATE INDEX IF NOT EXISTS idx_rds_products_name_trgm ON public.rds_products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rds_documents_store_updated ON public.rds_documents (store_id, updated_at DESC) WHERE deleted_at IS NULL;