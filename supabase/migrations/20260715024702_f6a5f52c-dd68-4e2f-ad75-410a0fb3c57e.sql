
ALTER TABLE public.guest_customers ADD COLUMN IF NOT EXISTS tax_id text, ADD COLUMN IF NOT EXISTS tax_branch text;
ALTER TABLE public.guest_orders ADD COLUMN IF NOT EXISTS customer_tax_id text, ADD COLUMN IF NOT EXISTS customer_branch text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_tax_id text, ADD COLUMN IF NOT EXISTS customer_branch text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tax_branch text;
ALTER TABLE public.film_customers ADD COLUMN IF NOT EXISTS tax_branch text;
ALTER TABLE public.film_invoices ADD COLUMN IF NOT EXISTS customer_branch text;
