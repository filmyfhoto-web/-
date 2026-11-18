ALTER TABLE public.rds_document_layouts
  ADD COLUMN IF NOT EXISTS logo_scale numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS logo_align text NOT NULL DEFAULT 'right',
  ADD COLUMN IF NOT EXISTS page_gap_mm numeric NOT NULL DEFAULT 16;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rds_document_layouts_logo_align_chk'
  ) THEN
    ALTER TABLE public.rds_document_layouts
      ADD CONSTRAINT rds_document_layouts_logo_align_chk
      CHECK (logo_align IN ('left','center','right'));
  END IF;
END $$;