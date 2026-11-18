ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS auto_fit_a4 boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS print_scale numeric(5,2);

COMMENT ON COLUMN public.rds_documents.auto_fit_a4 IS 'When true, always auto-fit content to one A4 page on print.';
COMMENT ON COLUMN public.rds_documents.print_scale IS 'Manual print scale (e.g. 0.95 = 95%). NULL = use auto-fit.';