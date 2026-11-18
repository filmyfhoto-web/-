DO $$
DECLARE t text; tables text[] := ARRAY[
  'categories','guest_orders','import_jobs','inbox_threads','notifications','orders','order_items','order_status_events',
  'pos_receipts','product_costs','product_images','product_shops','products','product_variants','product_unit_links',
  'purchase_orders','rds_document_items','rds_documents','rds_products','rds_customers','rds_payments','rds_activity_logs',
  'shop_promos','stock_movements','customers','employees','invoices','job_requests','organizations','paper_withdrawals',
  'pos_products','shop_settings','transactions','admin_line_links','cash_drawer_audit','cash_drawer_shifts',
  'cash_drawer_transactions','film_job_requests','line_notification_settings','line_notifications','cash_advances',
  'cash_advance_repayments'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid=pr.prrelid
        JOIN pg_publication p ON p.oid=pr.prpubid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE p.pubname='supabase_realtime' AND n.nspname='public' AND c.relname=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;