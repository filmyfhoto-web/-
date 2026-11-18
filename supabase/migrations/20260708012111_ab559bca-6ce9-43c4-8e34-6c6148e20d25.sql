
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS drive_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drive_last_error TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS drive_root_folder_id TEXT;

CREATE TABLE public.order_drive_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  drive_file_id TEXT NOT NULL,
  drive_file_url TEXT,
  drive_thumbnail_url TEXT,
  kind TEXT NOT NULL DEFAULT 'attachment',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_drive_files_order ON public.order_drive_files(order_id, uploaded_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_drive_files TO authenticated;
GRANT ALL ON public.order_drive_files TO service_role;

ALTER TABLE public.order_drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read drive files"
  ON public.order_drive_files FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff insert drive files"
  ON public.order_drive_files FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff update drive files"
  ON public.order_drive_files FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff delete drive files"
  ON public.order_drive_files FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
