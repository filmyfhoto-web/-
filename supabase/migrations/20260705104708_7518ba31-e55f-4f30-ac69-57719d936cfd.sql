
ALTER TABLE public.line_login_diagnostics DROP CONSTRAINT IF EXISTS line_login_diagnostics_event_check;
ALTER TABLE public.line_login_diagnostics ADD CONSTRAINT line_login_diagnostics_event_check
  CHECK (event = ANY (ARRAY[
    'liff_init_fail'::text,
    'liff_login_loop'::text,
    'link_verify_fail'::text,
    'liff_redirect'::text,
    'liff_config_fallback'::text,
    'liff_auto_bind_ok'::text,
    'liff_auto_bind_fail'::text
  ]));

DROP POLICY IF EXISTS "Public can add line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Public can add line login diagnostics"
ON public.line_login_diagnostics
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event = ANY (ARRAY[
    'liff_init_fail'::text,
    'liff_login_loop'::text,
    'link_verify_fail'::text,
    'liff_redirect'::text,
    'liff_config_fallback'::text,
    'liff_auto_bind_ok'::text,
    'liff_auto_bind_fail'::text
  ])
  AND jsonb_typeof(detail) = 'object'
  AND pg_column_size(detail) <= 8192
);
