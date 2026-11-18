
-- Search RPC for autocomplete (only existing approved or pending orgs by name)
CREATE OR REPLACE FUNCTION public.search_organizations(q text)
RETURNS TABLE(id uuid, name text, type text, approved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.type::text, o.approved
  FROM public.organizations o
  WHERE auth.uid() IS NOT NULL
    AND coalesce(length(btrim(q)),0) >= 2
    AND o.name ILIKE '%' || btrim(q) || '%'
  ORDER BY o.approved DESC, o.name ASC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.search_organizations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_organizations(text) TO authenticated;

-- Register or join org (security definer to bypass RLS SELECT issue on insert RETURNING)
CREATE OR REPLACE FUNCTION public.signup_register_or_join_org(
  p_existing_org_id uuid,
  p_org_name text,
  p_type text,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_line_id text,
  p_address text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_org_name text;
  v_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_existing_org_id IS NOT NULL THEN
    SELECT id, name INTO v_org_id, v_org_name
    FROM public.organizations WHERE id = p_existing_org_id;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'organization not found';
    END IF;
    UPDATE public.profiles SET organization_id = v_org_id WHERE id = v_uid;
    INSERT INTO public.notifications (for_staff, type, title, body, ref_id)
    VALUES (true, 'new_signup', 'มีคนขอเข้าร่วมหน่วยงานเดิม',
            left(coalesce(p_contact_name,'') || ' ขอเข้าหน่วยงาน ' || coalesce(v_org_name,''), 500),
            v_org_id);
    RETURN v_org_id;
  END IF;

  IF coalesce(length(btrim(p_org_name)),0) < 2 THEN
    RAISE EXCEPTION 'organization name required';
  END IF;
  v_type := coalesce(nullif(p_type,''),'general');
  IF v_type NOT IN ('school','office','general') THEN
    v_type := 'general';
  END IF;

  INSERT INTO public.organizations (name, type, contact_name, phone, email, line_id, address, approved, price_group_id)
  VALUES (
    left(btrim(p_org_name), 200),
    v_type::organization_type,
    left(coalesce(p_contact_name,''), 200),
    left(coalesce(p_phone,''), 50),
    left(coalesce(p_email,''), 200),
    left(coalesce(p_line_id,''), 100),
    left(coalesce(p_address,''), 1000),
    false,
    NULL
  )
  RETURNING id INTO v_org_id;

  UPDATE public.profiles SET organization_id = v_org_id WHERE id = v_uid;

  INSERT INTO public.notifications (for_staff, type, title, body, ref_id)
  VALUES (true, 'new_signup', 'มีหน่วยงานสมัครใหม่',
          left(coalesce(p_org_name,'') || ' (' || coalesce(p_contact_name,'') || ')', 500),
          v_org_id);

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_register_or_join_org(uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_register_or_join_org(uuid,text,text,text,text,text,text,text) TO authenticated;
