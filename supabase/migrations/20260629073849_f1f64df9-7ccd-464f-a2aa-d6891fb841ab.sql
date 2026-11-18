
CREATE INDEX IF NOT EXISTS idx_rds_documents_store_type_created
  ON public.rds_documents (store_id, document_type, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rds_documents_store_status_created
  ON public.rds_documents (store_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rds_documents_created_at
  ON public.rds_documents (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_staff_created
  ON public.notifications (created_at DESC)
  WHERE for_staff = true;

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_org_created
  ON public.orders (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_notifications_sent_status_created
  ON public.line_notifications (sent_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rds_customers_store_name
  ON public.rds_customers (store_id, name);

CREATE INDEX IF NOT EXISTS idx_rds_products_store_active
  ON public.rds_products (store_id, is_active, name);
