
ALTER TABLE public.film_order_jobs
  ADD COLUMN IF NOT EXISTS queue_no integer,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'intake',
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES public.film_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assign_reason text,
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.film_employees
  ADD COLUMN IF NOT EXISTS job_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

CREATE SEQUENCE IF NOT EXISTS public.film_job_queue_no_seq;

CREATE OR REPLACE FUNCTION public.film_order_jobs_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.queue_no IS NULL THEN
    NEW.queue_no := nextval('public.film_job_queue_no_seq');
  END IF;
  IF NEW.stage IS NULL THEN
    NEW.stage := 'intake';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_film_order_jobs_defaults ON public.film_order_jobs;
CREATE TRIGGER trg_film_order_jobs_defaults
  BEFORE INSERT OR UPDATE ON public.film_order_jobs
  FOR EACH ROW EXECUTE FUNCTION public.film_order_jobs_defaults();

-- backfill existing rows in creation order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.film_order_jobs
  WHERE queue_no IS NULL
)
UPDATE public.film_order_jobs j
SET queue_no = o.rn
FROM ordered o
WHERE j.id = o.id;

SELECT setval('public.film_job_queue_no_seq', GREATEST(1, COALESCE((SELECT MAX(queue_no) FROM public.film_order_jobs), 0)));

CREATE UNIQUE INDEX IF NOT EXISTS film_order_jobs_queue_no_key ON public.film_order_jobs(queue_no);
CREATE INDEX IF NOT EXISTS film_order_jobs_stage_idx ON public.film_order_jobs(stage);
CREATE INDEX IF NOT EXISTS film_order_jobs_assignee_idx ON public.film_order_jobs(assigned_employee_id);
