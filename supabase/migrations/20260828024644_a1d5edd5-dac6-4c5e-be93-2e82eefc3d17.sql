ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS doc_intent text NOT NULL DEFAULT 'order';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quote_file jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quote_sent_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS priced_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS priced_by text;

ALTER TABLE public.customer_purchase_orders ADD COLUMN IF NOT EXISTS quote_file jsonb;
ALTER TABLE public.customer_purchase_orders ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE public.customer_purchase_orders ADD COLUMN IF NOT EXISTS quote_sent_by text;
ALTER TABLE public.customer_purchase_orders ADD COLUMN IF NOT EXISTS priced_at timestamptz;
ALTER TABLE public.customer_purchase_orders ADD COLUMN IF NOT EXISTS priced_by text;

ALTER TABLE public.school_requisitions ADD COLUMN IF NOT EXISTS quote_file jsonb;
ALTER TABLE public.school_requisitions ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz;
ALTER TABLE public.school_requisitions ADD COLUMN IF NOT EXISTS quote_sent_by text;
ALTER TABLE public.school_requisitions ADD COLUMN IF NOT EXISTS priced_at timestamptz;
ALTER TABLE public.school_requisitions ADD COLUMN IF NOT EXISTS priced_by text;