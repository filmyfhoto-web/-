
-- 1. Extend rds_stores with per-doc-type Drive folder ids
ALTER TABLE public.rds_stores
  ADD COLUMN IF NOT EXISTS drive_root_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_orders_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_quotes_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_receipts_folder_id text;

-- 2. Add shop_id to orders + backfill from drive_store_slug
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.rds_stores(id);

UPDATE public.orders o
SET shop_id = s.id
FROM public.rds_stores s
WHERE o.shop_id IS NULL
  AND o.drive_store_slug IS NOT NULL
  AND s.slug = o.drive_store_slug;

CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id) WHERE shop_id IS NOT NULL;

-- 3. Add shop_id + Drive retry fields to rds_documents
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.rds_stores(id),
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_folder_url text,
  ADD COLUMN IF NOT EXISTS drive_retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drive_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_last_error_code text,
  ADD COLUMN IF NOT EXISTS drive_last_error_at timestamptz;

UPDATE public.rds_documents
SET shop_id = store_id
WHERE shop_id IS NULL AND store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rds_documents_shop_id
  ON public.rds_documents(shop_id) WHERE shop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rds_documents_drive_pending
  ON public.rds_documents(drive_next_retry_at)
  WHERE google_drive_sync_status IN ('pending','retry','failed');
