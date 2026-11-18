
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS google_drive_file_id text,
  ADD COLUMN IF NOT EXISTS google_drive_url text,
  ADD COLUMN IF NOT EXISTS last_sync_error text;
