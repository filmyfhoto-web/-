ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS font_scale numeric(5,2);

COMMENT ON COLUMN public.rds_documents.font_scale IS 'Manual font scale for printed document (e.g. 0.85 = 85%). NULL = 100%.';