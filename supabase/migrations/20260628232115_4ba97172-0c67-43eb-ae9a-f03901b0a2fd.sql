CREATE OR REPLACE FUNCTION public.signup_register_or_join_org(p_existing_org_id uuid, p_org_name text, p_type text, p_contact_name text, p_phone text, p_email text, p_line_id text, p_address text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_org_name text;
  v_type text;
  v_current_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT organization_id INTO v_current_org FROM public.profiles WHERE id = v_uid;
  IF v_current_org IS NOT NULL THEN
    RAISE EXCEPTION 'organization already set — contact staff to change';
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
    v_type::public.customer_type,
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
$function$;