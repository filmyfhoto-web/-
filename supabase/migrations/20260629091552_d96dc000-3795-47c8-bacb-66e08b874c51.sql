ALTER TABLE public.rds_products ADD COLUMN IF NOT EXISTS barcode text;
CREATE INDEX IF NOT EXISTS idx_rds_products_barcode ON public.rds_products(store_id, barcode) WHERE barcode IS NOT NULL;