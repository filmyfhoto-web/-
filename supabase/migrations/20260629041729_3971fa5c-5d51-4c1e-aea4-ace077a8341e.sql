
CREATE OR REPLACE FUNCTION public.admin_delete_orphan_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_orders int;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = p_user_id;
  IF v_org IS NOT NULL THEN
    RAISE EXCEPTION 'user has organization — cannot delete as orphan';
  END IF;

  SELECT count(*) INTO v_orders FROM public.orders WHERE customer_id = p_user_id;
  IF v_orders > 0 THEN
    RAISE EXCEPTION 'user has orders — cannot delete';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'profile_delete_orphan', 'profile', p_user_id, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_org_type(p_org_id uuid, p_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_type NOT IN ('school','office','general') THEN
    RAISE EXCEPTION 'invalid type';
  END IF;
  UPDATE public.organizations SET type = p_type::public.customer_type, updated_at = now() WHERE id = p_org_id;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'org_set_type', 'organization', p_org_id, jsonb_build_object('type', p_type));
END;
$$;
