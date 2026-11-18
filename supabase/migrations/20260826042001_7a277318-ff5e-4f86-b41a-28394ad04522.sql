DROP INDEX IF EXISTS public.idx_rds_products_name_trgm;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_rds_products_name_trgm ON public.rds_products USING gin (name extensions.gin_trgm_ops);