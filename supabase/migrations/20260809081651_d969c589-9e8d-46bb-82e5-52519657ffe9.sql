CREATE TABLE public.film_line_intake_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id TEXT NOT NULL DEFAULT 'default',
  line_user_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'user',
  line_room_id TEXT,
  display_name TEXT,
  state TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'draft',
  is_test BOOLEAN NOT NULL DEFAULT false,
  customer_name TEXT,
  customer_phone TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_at TIMESTAMPTZ,
  notes TEXT,
  order_id UUID REFERENCES public.film_orders(id) ON DELETE SET NULL,
  order_no TEXT,
  last_event_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '12 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.film_line_intake_sessions TO authenticated;
GRANT ALL ON public.film_line_intake_sessions TO service_role;
ALTER TABLE public.film_line_intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read line intake sessions"
ON public.film_line_intake_sessions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'stock_staff')
  OR public.has_role(auth.uid(), 'photo_staff')
);

CREATE INDEX film_line_intake_sessions_open_idx
  ON public.film_line_intake_sessions (line_user_id, status, created_at DESC);
CREATE INDEX film_line_intake_sessions_order_idx
  ON public.film_line_intake_sessions (order_id);

CREATE TRIGGER film_line_intake_sessions_touch
BEFORE UPDATE ON public.film_line_intake_sessions
FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();

CREATE TABLE public.film_line_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (line_user_id, window_start)
);

GRANT SELECT ON public.film_line_rate_limits TO authenticated;
GRANT ALL ON public.film_line_rate_limits TO service_role;
ALTER TABLE public.film_line_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read line rate limits"
ON public.film_line_rate_limits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER film_line_rate_limits_touch
BEFORE UPDATE ON public.film_line_rate_limits
FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();

ALTER TABLE public.film_orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS film_orders_is_test_idx ON public.film_orders (is_test) WHERE is_test;

CREATE OR REPLACE FUNCTION public.film_purge_test_data()
RETURNS TABLE (orders_deleted INTEGER, sessions_deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders INTEGER := 0;
  v_sessions INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;

  DELETE FROM public.film_line_intake_sessions WHERE is_test;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.film_order_jobs
    WHERE order_id IN (SELECT id FROM public.film_orders WHERE is_test);
  DELETE FROM public.film_order_items
    WHERE order_id IN (SELECT id FROM public.film_orders WHERE is_test);
  DELETE FROM public.film_order_events
    WHERE order_id IN (SELECT id FROM public.film_orders WHERE is_test);
  DELETE FROM public.film_orders WHERE is_test;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  RETURN QUERY SELECT v_orders, v_sessions;
END;
$$;

REVOKE ALL ON FUNCTION public.film_purge_test_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.film_purge_test_data() TO authenticated;