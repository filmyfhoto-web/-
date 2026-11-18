ALTER TABLE public.school_requisitions
  ADD COLUMN IF NOT EXISTS req_number text,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS receive_method text,
  ADD COLUMN IF NOT EXISTS want_date date,
  ADD COLUMN IF NOT EXISTS source_files jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS school_requisitions_req_number_key
  ON public.school_requisitions (req_number) WHERE req_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS school_requisitions_customer_idx
  ON public.school_requisitions (customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.next_requisition_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int + 543;
  prefix text;
  nxt int;
BEGIN
  prefix := 'BR-' || yr::text || '-';
  PERFORM pg_advisory_xact_lock(hashtext('requisition_number_' || yr::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(req_number, '^' || prefix, ''), '')::int), 0) + 1
    INTO nxt
    FROM public.school_requisitions
   WHERE req_number LIKE prefix || '%'
     AND req_number ~ ('^' || prefix || '[0-9]+$');
  RETURN prefix || lpad(nxt::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_requisition_number() FROM public;
GRANT EXECUTE ON FUNCTION public.next_requisition_number() TO authenticated, service_role;