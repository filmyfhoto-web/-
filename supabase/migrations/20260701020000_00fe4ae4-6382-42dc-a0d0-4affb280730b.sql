CREATE OR REPLACE FUNCTION public.guest_approve_order(p_guest_id uuid, p_phone text, p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
     SET status = 'approved', updated_at = NOW()
   WHERE id = p_order_id
     AND is_guest = true
     AND guest_id = p_guest_id
     AND guest_phone = p_phone
     AND status = 'quoted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_not_quoted' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.guest_approve_order(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_approve_order(uuid, text, uuid) TO anon, authenticated, service_role;