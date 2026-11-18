CREATE OR REPLACE FUNCTION public.admin_create_line_customer(
  p_line_user_id text,
  p_name text,
  p_phone text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_display text;
  v_pic text;
  v_name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_line_user_id IS NULL OR p_line_user_id = '' THEN RAISE EXCEPTION 'invalid_input'; END IF;

  SELECT customer_id INTO v_existing FROM public.line_account_links WHERE line_user_id = p_line_user_id;
  IF v_existing IS NOT NULL AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'reason', 'line_bound_to_other_customer', 'existing_customer_id', v_existing);
  END IF;

  SELECT display_name, picture_url INTO v_display, v_pic
    FROM public.line_account_links WHERE line_user_id = p_line_user_id;

  v_name := NULLIF(btrim(coalesce(p_name, '')), '');
  v_name := coalesce(v_name, NULLIF(btrim(coalesce(v_display, '')), ''), 'ลูกค้า LINE');

  INSERT INTO public.guest_customers (name, phone, line_user_id, last_seen_at)
  VALUES (v_name, NULLIF(btrim(coalesce(p_phone, '')), ''), p_line_user_id, now())
  RETURNING id INTO v_id;

  INSERT INTO public.line_account_links (line_user_id, customer_id, customer_source, display_name, picture_url, verified_at, updated_at)
  VALUES (p_line_user_id, v_id, 'guest', v_display, v_pic, now(), now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET customer_id = EXCLUDED.customer_id,
        customer_source = 'guest',
        verified_at = now(),
        updated_at = now();

  INSERT INTO public.security_audit_log (event_type, severity, actor_user_id, target_type, target_id, detail)
  VALUES ('line_create_and_bind_customer', 'info', auth.uid(), 'guest_customers', v_id::text,
          jsonb_build_object('line_user_id', p_line_user_id, 'customer_name', v_name,
                             'previous_customer_id', v_existing, 'forced', p_force));

  RETURN jsonb_build_object('ok', true, 'customer_id', v_id, 'name', v_name, 'source', 'guest');
END
$$;

REVOKE ALL ON FUNCTION public.admin_create_line_customer(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_line_customer(text, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_line_customer(text, text, text, boolean) TO authenticated;