
DROP POLICY IF EXISTS "public read order_status_events" ON public.order_status_events;
REVOKE SELECT ON public.order_status_events FROM anon;

CREATE OR REPLACE FUNCTION public.get_order_status_events(
  p_order_id uuid,
  p_link_token text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_staff_any(auth.uid()) THEN
    v_ok := true;
  END IF;

  IF NOT v_ok AND p_link_token IS NOT NULL AND length(p_link_token) >= 16 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = p_order_id
        AND o.line_link_token = p_link_token
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.status, e.note, e.created_at
  FROM public.order_status_events e
  WHERE e.order_id = p_order_id
  ORDER BY e.created_at DESC
  LIMIT 50;
END
$$;

REVOKE ALL ON FUNCTION public.get_order_status_events(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_status_events(uuid, text) TO anon, authenticated;
