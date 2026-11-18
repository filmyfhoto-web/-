-- Enable realtime for remaining tables
ALTER TABLE public.rds_document_items REPLICA IDENTITY FULL;
ALTER TABLE public.rds_payments REPLICA IDENTITY FULL;
ALTER TABLE public.rds_customers REPLICA IDENTITY FULL;
ALTER TABLE public.rds_activity_logs REPLICA IDENTITY FULL;
ALTER TABLE public.rds_documents REPLICA IDENTITY FULL;
ALTER TABLE public.rds_products REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_document_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_customers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_activity_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;