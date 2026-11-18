ALTER TABLE public.line_login_diagnostics DROP CONSTRAINT IF EXISTS line_login_diagnostics_event_check;
ALTER TABLE public.line_login_diagnostics ADD CONSTRAINT line_login_diagnostics_event_check CHECK (event = ANY (ARRAY[
  'liff_init_fail'::text,
  'liff_login_loop'::text,
  'link_verify_fail'::text,
  'liff_redirect'::text,
  'liff_config_fallback'::text,
  'liff_auto_bind_ok'::text,
  'liff_auto_bind_fail'::text,
  'endpoint_probe:webhook'::text,
  'endpoint_probe:liff'::text,
  'external_liff_report'::text,
  'line_endpoint_unreachable'::text
]));