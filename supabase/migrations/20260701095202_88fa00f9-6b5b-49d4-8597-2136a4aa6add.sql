CREATE OR REPLACE FUNCTION public.admin_set_role_by_email(p_email text, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'owner only'; END IF;
  IF p_role NOT IN ('owner','admin','stock_staff','photo_staff','customer') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) < 3 THEN
    RAISE EXCEPTION 'email required';
  END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email)) LIMIT 1;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, p_role::app_role);
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'admin_set_role_by_email', 'profile', v_uid,
          jsonb_build_object('email', p_email, 'role', p_role));
  RETURN jsonb_build_object('found', true, 'user_id', v_uid, 'role', p_role);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_role_by_email(text, text) TO authenticated;