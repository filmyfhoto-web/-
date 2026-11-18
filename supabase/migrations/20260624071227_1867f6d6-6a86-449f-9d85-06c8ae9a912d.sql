ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS print_status text NOT NULL DEFAULT 'not_printed',
  ADD COLUMN IF NOT EXISTS last_printed_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rds_documents_print_status_chk') THEN
    ALTER TABLE public.rds_documents
      ADD CONSTRAINT rds_documents_print_status_chk
      CHECK (print_status IN ('not_printed','printed','print_error'));
  END IF;
END $$;