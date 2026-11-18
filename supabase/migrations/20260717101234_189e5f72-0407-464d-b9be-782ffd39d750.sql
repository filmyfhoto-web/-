ALTER TABLE public.line_login_diagnostics DROP CONSTRAINT IF EXISTS line_login_diagnostics_event_check;
ALTER TABLE public.line_login_diagnostics ADD CONSTRAINT line_login_diagnostics_event_check CHECK (event = ANY (ARRAY['liff_init_fail','liff_login_loop','link_verify_fail','liff_redirect','liff_config_fallback','liff_auto_bind_ok','liff_auto_bind_fail','endpoint_probe:webhook','endpoint_probe:liff']));

DROP POLICY IF EXISTS "Authenticated can add line login diagnostics" ON public.line_login_diagnostics;
CREATE POLICY "Authenticated can add line login diagnostics"
ON public.line_login_diagnostics
FOR INSERT
TO authenticated
WITH CHECK (
  (event = ANY (ARRAY['liff_init_fail','liff_login_loop','link_verify_fail','liff_redirect','liff_config_fallback','liff_auto_bind_ok','liff_auto_bind_fail','endpoint_probe:webhook','endpoint_probe:liff']))
  AND jsonb_typeof(detail) = 'object'
  AND pg_column_size(detail) <= 8192
);