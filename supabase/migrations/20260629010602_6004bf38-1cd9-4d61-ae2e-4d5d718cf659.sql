-- Admin tools to repair users with NULL organization_id
CREATE OR REPLACE FUNCTION public.admin_list_orphan_profiles()
RETURNS TABLE(id uuid, full_name text, email text, phone text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.phone, p.created_at
  FROM public.profiles p
  WHERE public.is_staff(auth.uid())
    AND p.organization_id IS NULL
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer')
  ORDER BY p.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.admin_repair_user_org(
  p_user_id uuid,
  p_existing_org_id uuid,
  p_new_org_name text,
  p_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_type text;
  v_current uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  SELECT organization_id INTO v_current FROM public.profiles WHERE id = p_user_id;
  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'user already linked to organization';
  END IF;

  IF p_existing_org_id IS NOT NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE id = p_existing_org_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'organization not found'; END IF;
  ELSE
    IF coalesce(length(btrim(p_new_org_name)), 0) < 2 THEN
      RAISE EXCEPTION 'organization name required';
    END IF;
    v_type := coalesce(nullif(p_type, ''), 'general');
    IF v_type NOT IN ('school','office','general') THEN v_type := 'general'; END IF;
    INSERT INTO public.organizations(name, type, approved)
    VALUES (left(btrim(p_new_org_name), 200), v_type::public.customer_type, false)
    RETURNING id INTO v_org_id;
  END IF;

  UPDATE public.profiles SET organization_id = v_org_id WHERE id = p_user_id;

  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'profile_repair_org', 'profile', p_user_id,
          jsonb_build_object('organization_id', v_org_id, 'created_new', p_existing_org_id IS NULL));

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_orphan_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_repair_user_org(uuid, uuid, text, text) TO authenticated;