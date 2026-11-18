CREATE OR REPLACE FUNCTION public.film_job_request_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_no IS NULL THEN
    NEW.job_no := 'NG-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMMDD') || '-' ||
                  lpad(nextval('public.film_job_request_no_seq')::text, 4, '0');
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;