CREATE TABLE IF NOT EXISTS public.line_login_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL CHECK (event IN ('liff_init_fail','liff_login_loop','link_verify_fail','liff_redirect','liff_config_fallback')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.line_login_diagnostics TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.line_login_diagnostics TO authenticated;
GRANT ALL ON public.line_login_diagnostics TO service_role;

ALTER TABLE public.line_login_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can add line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Public can add line login diagnostics"
ON public.line_login_diagnostics
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event IN ('liff_init_fail','liff_login_loop','link_verify_fail','liff_redirect','liff_config_fallback')
  AND jsonb_typeof(detail) = 'object'
  AND pg_column_size(detail) <= 8192
);

DROP POLICY IF EXISTS "Staff can read line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Staff can read line login diagnostics"
ON public.line_login_diagnostics
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can clean line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Staff can clean line login diagnostics"
ON public.line_login_diagnostics
FOR DELETE
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_line_login_diagnostics_created_at ON public.line_login_diagnostics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_login_diagnostics_event ON public.line_login_diagnostics(event);

REVOKE ALL ON FUNCTION public.get_public_liff_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_liff_config() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_liff_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_liff_config() TO service_role;