CREATE OR REPLACE FUNCTION public.notify_staff(p_type text, p_title text, p_body text, p_ref_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_type NOT IN ('new_order', 'new_signup') THEN
    RAISE EXCEPTION 'invalid notification type';
  END IF;
  IF p_ref_id IS NULL THEN
    RAISE EXCEPTION 'ref_id required';
  END IF;

  IF p_type = 'new_order' THEN
    PERFORM 1 FROM public.orders
      WHERE id = p_ref_id AND customer_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ref_id does not match a valid order for this user';
    END IF;
  ELSIF p_type = 'new_signup' THEN
    SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;
    IF v_org IS NULL OR v_org <> p_ref_id THEN
      RAISE EXCEPTION 'ref_id does not match the caller organization';
    END IF;
  END IF;

  INSERT INTO public.notifications (for_staff, type, title, body, ref_id)
  VALUES (true, p_type, left(coalesce(p_title,''), 200), left(coalesce(p_body,''), 500), p_ref_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;