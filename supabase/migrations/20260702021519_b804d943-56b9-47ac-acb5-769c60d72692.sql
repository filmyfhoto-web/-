
-- 1) columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS line_link_token text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_line_link_token_key
  ON public.orders(line_link_token) WHERE line_link_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_line_user_id_idx
  ON public.orders(line_user_id) WHERE line_user_id IS NOT NULL;

-- 2) status events table
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff manage order_status_events" ON public.order_status_events;
CREATE POLICY "staff manage order_status_events"
  ON public.order_status_events
  FOR ALL
  TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE INDEX IF NOT EXISTS order_status_events_order_id_idx
  ON public.order_status_events(order_id, created_at DESC);

-- Realtime for timeline
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events;

-- 3) RPC: bind LINE user via link token (called by webhook via service role)
CREATE OR REPLACE FUNCTION public.bind_line_user_by_token(p_token text, p_line_user_id text)
RETURNS TABLE(order_id uuid, order_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_no text;
BEGIN
  IF p_token IS NULL OR p_line_user_id IS NULL THEN RAISE EXCEPTION 'missing params'; END IF;
  UPDATE public.orders
     SET line_user_id = p_line_user_id, updated_at = now()
   WHERE line_link_token = p_token
   RETURNING id, order_no INTO v_id, v_no;
  IF v_id IS NULL THEN RAISE EXCEPTION 'token not found'; END IF;
  -- also propagate to other recent orders of the same phone (best-effort)
  UPDATE public.orders o
     SET line_user_id = p_line_user_id
   WHERE o.line_user_id IS NULL
     AND o.guest_phone = (SELECT guest_phone FROM public.orders WHERE id = v_id)
     AND o.created_at > now() - interval '90 days';
  RETURN QUERY SELECT v_id, v_no;
END $$;

REVOKE ALL ON FUNCTION public.bind_line_user_by_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_line_user_by_token(text, text) TO service_role;

-- 4) RPC: admin updates order status + log event
CREATE OR REPLACE FUNCTION public.admin_set_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('pending_quote','pending_review','quoted','approved','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.orders SET status = p_status, updated_at = now() WHERE id = p_order_id;
  INSERT INTO public.order_status_events(order_id, status, note, created_by)
  VALUES (p_order_id, p_status, p_note, auth.uid());
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_order_status(uuid, text, text) TO authenticated;
