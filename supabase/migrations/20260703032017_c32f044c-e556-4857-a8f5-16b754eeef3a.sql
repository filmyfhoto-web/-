
CREATE TABLE IF NOT EXISTS public.line_phone_bindings (
  phone text PRIMARY KEY,
  line_user_id text NOT NULL,
  display_name text,
  bound_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.line_phone_bindings TO authenticated;
GRANT ALL ON public.line_phone_bindings TO service_role;

ALTER TABLE public.line_phone_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read line_phone_bindings" ON public.line_phone_bindings;
CREATE POLICY "staff read line_phone_bindings"
  ON public.line_phone_bindings FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_line_phone_bindings_luid ON public.line_phone_bindings(line_user_id);

CREATE OR REPLACE FUNCTION public.check_line_binding_by_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.line_phone_bindings b
    WHERE b.phone = btrim(coalesce(p_phone,''))
  )
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.guest_phone = btrim(coalesce(p_phone,''))
      AND o.line_user_id IS NOT NULL
    LIMIT 1
  );
$$;

REVOKE ALL ON FUNCTION public.check_line_binding_by_phone(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_line_binding_by_phone(text) TO anon, authenticated, service_role;
