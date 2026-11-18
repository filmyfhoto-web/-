REVOKE ALL ON public.guest_customers FROM anon, authenticated;
GRANT SELECT ON public.guest_customers TO authenticated;
GRANT ALL ON public.guest_customers TO service_role;

REVOKE ALL ON public.line_webhook_dedup FROM anon, authenticated;
GRANT ALL ON public.line_webhook_dedup TO service_role;

REVOKE ALL ON public.line_webhook_events FROM anon, authenticated;
GRANT SELECT ON public.line_webhook_events TO authenticated;
GRANT ALL ON public.line_webhook_events TO service_role;

REVOKE ALL ON public.myshop_webhook_events FROM anon, authenticated;
GRANT SELECT ON public.myshop_webhook_events TO authenticated;
GRANT ALL ON public.myshop_webhook_events TO service_role;