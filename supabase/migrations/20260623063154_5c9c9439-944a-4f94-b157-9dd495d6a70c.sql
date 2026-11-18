CREATE TABLE public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  filename text,
  file_size integer,
  file_hash text,
  total_rows integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  deleted integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  warnings_count integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  row_results jsonb,
  validation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_logs TO authenticated;
GRANT ALL ON public.import_logs TO service_role;

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view import logs"
  ON public.import_logs FOR SELECT
  TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "Staff can insert import logs"
  ON public.import_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()) AND user_id = auth.uid());

CREATE INDEX import_logs_created_at_idx ON public.import_logs (created_at DESC);