
-- ============================================================
-- 1. assigned_to + index
-- ============================================================
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rds_documents_assigned_to ON public.rds_documents(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rds_documents_customer_id ON public.rds_documents(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rds_documents_status ON public.rds_documents(status);

-- ============================================================
-- 2. Helper: does the current customer own this document?
-- ============================================================
CREATE OR REPLACE FUNCTION public.customer_owns_document(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rds_documents d
    JOIN public.rds_customers c ON c.id = d.customer_id
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE d.id = _doc_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.customer_owns_customer_row(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rds_customers c
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE c.id = _customer_id
      AND p.id = auth.uid()
      AND c.org_id IS NOT NULL
  );
$$;

-- ============================================================
-- 3. GRANTs (RLS still gates rows)
-- ============================================================
GRANT SELECT ON public.rds_documents TO authenticated;
GRANT SELECT ON public.rds_document_items TO authenticated;
GRANT SELECT ON public.rds_payments TO authenticated;
GRANT SELECT ON public.rds_customers TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.rds_activity_logs TO authenticated;

-- ============================================================
-- 4. Customer-visible policies (additive — do NOT drop staff policies)
-- ============================================================
DROP POLICY IF EXISTS "customer read own documents" ON public.rds_documents;
CREATE POLICY "customer read own documents"
  ON public.rds_documents
  FOR SELECT
  TO authenticated
  USING (
    is_staff_any(auth.uid())
    OR assigned_to = auth.uid()
    OR public.customer_owns_document(id)
  );

DROP POLICY IF EXISTS "customer read own document items" ON public.rds_document_items;
CREATE POLICY "customer read own document items"
  ON public.rds_document_items
  FOR SELECT
  TO authenticated
  USING (
    is_staff_any(auth.uid())
    OR public.customer_owns_document(document_id)
  );

DROP POLICY IF EXISTS "customer read own document payments" ON public.rds_payments;
CREATE POLICY "customer read own document payments"
  ON public.rds_payments
  FOR SELECT
  TO authenticated
  USING (
    is_staff_any(auth.uid())
    OR public.customer_owns_document(document_id)
  );

DROP POLICY IF EXISTS "customer read own customer row" ON public.rds_customers;
CREATE POLICY "customer read own customer row"
  ON public.rds_customers
  FOR SELECT
  TO authenticated
  USING (
    is_staff_any(auth.uid())
    OR public.customer_owns_customer_row(id)
  );

-- ============================================================
-- 5. Status-change trigger: notify + activity log
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_rds_documents_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_user uuid;
  v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN
    RETURN NEW;
  END IF;

  v_title := 'สถานะเอกสาร ' || COALESCE(NEW.document_no, '') || ' เปลี่ยนเป็น ' || COALESCE(NEW.status, '');

  -- staff notification (broadcast)
  INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id)
  VALUES (
    true,
    NULL,
    'doc_status_change',
    v_title,
    jsonb_build_object(
      'document_id', NEW.id,
      'document_no', NEW.document_no,
      'document_type', NEW.document_type,
      'customer_name', NEW.customer_name,
      'old_status', COALESCE(OLD.status, NULL),
      'new_status', NEW.status,
      'actor', v_actor,
      'changed_at', now()
    )::text,
    NEW.id
  );

  -- notify each owner (customer) — one row per profile in the customer's organization
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id)
    SELECT
      false,
      p.id,
      'doc_status_change',
      v_title,
      jsonb_build_object(
        'document_id', NEW.id,
        'document_no', NEW.document_no,
        'document_type', NEW.document_type,
        'old_status', COALESCE(OLD.status, NULL),
        'new_status', NEW.status,
        'changed_at', now()
      )::text,
      NEW.id
    FROM public.rds_customers c
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE c.id = NEW.customer_id
      AND c.org_id IS NOT NULL;
  END IF;

  -- notify assignee
  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id)
    VALUES (
      false,
      NEW.assigned_to,
      'doc_status_change',
      v_title,
      jsonb_build_object(
        'document_id', NEW.id,
        'document_no', NEW.document_no,
        'new_status', NEW.status,
        'assigned', true
      )::text,
      NEW.id
    );
  END IF;

  -- activity log
  INSERT INTO public.rds_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (
    NEW.store_id,
    v_actor,
    CASE WHEN TG_OP='INSERT' THEN 'document_create' ELSE 'document_status_change' END,
    'document',
    NEW.id,
    jsonb_build_object(
      'document_no', NEW.document_no,
      'document_type', NEW.document_type,
      'customer_name', NEW.customer_name,
      'old_status', CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rds_documents_status_change ON public.rds_documents;
CREATE TRIGGER rds_documents_status_change
  AFTER INSERT OR UPDATE OF status ON public.rds_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rds_documents_status_change();

-- ============================================================
-- 6. Activity log triggers for related entities
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_log_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_store uuid;
  v_target_id uuid;
  v_action text;
  v_target_type text := TG_ARGV[0];
  v_detail jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := v_target_type || '_create';
    v_target_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := v_target_type || '_update';
    v_target_id := NEW.id;
  ELSE
    v_action := v_target_type || '_delete';
    v_target_id := OLD.id;
  END IF;

  -- pick store_id if column exists in row
  BEGIN v_store := (CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END);
  EXCEPTION WHEN undefined_column THEN v_store := NULL; END;

  v_detail := jsonb_build_object('op', TG_OP);
  IF v_target_type = 'product' THEN
    v_detail := v_detail || jsonb_build_object(
      'name', COALESCE((CASE WHEN TG_OP='DELETE' THEN OLD.name ELSE NEW.name END), ''),
      'price_changed', (TG_OP='UPDATE' AND COALESCE(NEW.price,0) <> COALESCE(OLD.price,0)),
      'stock_changed', (TG_OP='UPDATE' AND COALESCE(NEW.stock_qty,0) <> COALESCE(OLD.stock_qty,0)),
      'old_price', CASE WHEN TG_OP='UPDATE' THEN OLD.price ELSE NULL END,
      'new_price', CASE WHEN TG_OP<>'DELETE' THEN NEW.price ELSE NULL END,
      'old_stock', CASE WHEN TG_OP='UPDATE' THEN OLD.stock_qty ELSE NULL END,
      'new_stock', CASE WHEN TG_OP<>'DELETE' THEN NEW.stock_qty ELSE NULL END
    );
  ELSIF v_target_type = 'customer' THEN
    v_detail := v_detail || jsonb_build_object(
      'name', COALESCE((CASE WHEN TG_OP='DELETE' THEN OLD.name ELSE NEW.name END), '')
    );
  END IF;

  INSERT INTO public.rds_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (v_store, v_actor, v_action, v_target_type, v_target_id, v_detail);

  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS rds_products_activity_log ON public.rds_products;
CREATE TRIGGER rds_products_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.rds_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_entity_change('product');

DROP TRIGGER IF EXISTS rds_customers_activity_log ON public.rds_customers;
CREATE TRIGGER rds_customers_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.rds_customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_log_entity_change('customer');
