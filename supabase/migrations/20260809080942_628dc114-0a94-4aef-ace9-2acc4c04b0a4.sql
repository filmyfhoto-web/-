CREATE OR REPLACE FUNCTION public.film_order_jobs_set_job_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_no text;
  v_seq int;
BEGIN
  IF NEW.job_no IS NOT NULL AND length(trim(NEW.job_no)) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT order_no INTO v_order_no FROM public.film_orders WHERE id = NEW.order_id;
  IF v_order_no IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) + 1 INTO v_seq FROM public.film_order_jobs WHERE order_id = NEW.order_id;
  NEW.job_no := v_order_no || '-' || lpad(v_seq::text, 2, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_film_order_jobs_set_job_no ON public.film_order_jobs;
CREATE TRIGGER trg_film_order_jobs_set_job_no
BEFORE INSERT ON public.film_order_jobs
FOR EACH ROW EXECUTE FUNCTION public.film_order_jobs_set_job_no();