
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS drive_store_slug TEXT;

ALTER TABLE public.order_drive_files
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_slug TEXT,
  ADD COLUMN IF NOT EXISTS payload_path TEXT;

ALTER TABLE public.order_drive_files
  ALTER COLUMN drive_file_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_drive_files_retry
  ON public.order_drive_files(status, next_retry_at)
  WHERE status = 'pending_retry';
