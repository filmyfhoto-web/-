ALTER TABLE public.line_account_links DROP CONSTRAINT IF EXISTS line_account_links_customer_source_check;
ALTER TABLE public.line_account_links ADD CONSTRAINT line_account_links_customer_source_check
  CHECK (customer_source = ANY (ARRAY['rds','guest','profile','admin_manual','admin_unbound']));