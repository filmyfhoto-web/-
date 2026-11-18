CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  filename text,
  file_size integer,
  file_hash text,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  deleted integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'prepare',
  message text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all import jobs"
  ON public.import_jobs FOR SELECT
  TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "Owner can insert own import jobs"
  ON public.import_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Owner can update own import jobs"
  ON public.import_jobs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX import_jobs_active_idx ON public.import_jobs (finished_at NULLS FIRST, started_at DESC);

CREATE OR REPLACE FUNCTION public.trg_import_jobs_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER import_jobs_set_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.trg_import_jobs_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_import_jobs_cleanup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.import_jobs
   WHERE finished_at IS NOT NULL AND finished_at < now() - interval '24 hours';
  RETURN NEW;
END; $$;

CREATE TRIGGER import_jobs_cleanup_on_insert
  AFTER INSERT ON public.import_jobs
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_import_jobs_cleanup();

ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;