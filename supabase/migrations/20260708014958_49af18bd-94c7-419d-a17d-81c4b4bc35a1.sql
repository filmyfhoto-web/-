
DROP INDEX IF EXISTS public.idx_rds_documents_shop_id;
ALTER TABLE public.rds_documents DROP COLUMN IF EXISTS shop_id;
