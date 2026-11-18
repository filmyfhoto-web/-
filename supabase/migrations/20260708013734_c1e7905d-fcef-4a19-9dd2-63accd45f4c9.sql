
ALTER TABLE public.order_drive_files
  ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES public.rds_stores(id);

UPDATE public.order_drive_files f
SET shop_id = s.id
FROM public.rds_stores s
WHERE f.shop_id IS NULL AND f.store_slug = s.slug;

CREATE INDEX IF NOT EXISTS idx_order_drive_files_shop
  ON public.order_drive_files(shop_id) WHERE shop_id IS NOT NULL;
