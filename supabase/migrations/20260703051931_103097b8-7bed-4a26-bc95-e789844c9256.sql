ALTER TABLE public.admin_line_recipients
  ADD COLUMN IF NOT EXISTS status_filters text[] NULL;
COMMENT ON COLUMN public.admin_line_recipients.status_filters IS
  'NULL = receive all statuses; array = receive only listed statuses (new, confirmed, packing, shipped, delivered, cancelled)';