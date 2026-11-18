ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_line text NOT NULL DEFAULT 'other';
CREATE INDEX IF NOT EXISTS products_product_line_idx ON public.products(product_line);