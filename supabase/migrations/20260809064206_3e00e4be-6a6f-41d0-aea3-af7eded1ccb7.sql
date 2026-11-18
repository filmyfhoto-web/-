REVOKE ALL ON FUNCTION public.film_next_queue_code(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.film_priority_score(boolean, timestamptz, timestamptz, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.film_sync_order_ready() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.film_touch_updated_at() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.film_next_queue_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.film_priority_score(boolean, timestamptz, timestamptz, boolean) TO authenticated, service_role;