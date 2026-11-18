ALTER TABLE public.film_job_requests
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS job_no text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS pickup_method text,
  ADD COLUMN IF NOT EXISTS job_type text;

CREATE INDEX IF NOT EXISTS film_job_requests_created_by_idx ON public.film_job_requests(created_by);
CREATE UNIQUE INDEX IF NOT EXISTS film_job_requests_job_no_key ON public.film_job_requests(job_no) WHERE job_no IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.film_job_request_no_seq;

CREATE OR REPLACE FUNCTION public.film_job_request_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_no IS NULL THEN
    NEW.job_no := 'JOB-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMMDD') || '-' ||
                  lpad(nextval('public.film_job_request_no_seq')::text, 4, '0');
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_job_requests_set_defaults ON public.film_job_requests;
CREATE TRIGGER film_job_requests_set_defaults
  BEFORE INSERT ON public.film_job_requests
  FOR EACH ROW EXECUTE FUNCTION public.film_job_request_set_defaults();

DROP POLICY IF EXISTS "customers insert own job requests" ON public.film_job_requests;
CREATE POLICY "customers insert own job requests"
  ON public.film_job_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() AND source = 'customer');

DROP POLICY IF EXISTS "customers read own job requests" ON public.film_job_requests;
CREATE POLICY "customers read own job requests"
  ON public.film_job_requests
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());