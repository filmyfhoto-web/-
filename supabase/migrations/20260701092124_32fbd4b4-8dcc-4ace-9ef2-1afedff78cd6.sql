ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS school_name TEXT;
CREATE INDEX IF NOT EXISTS orders_school_name_idx ON public.orders (lower(school_name));