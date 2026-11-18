
-- 1) Notifications on approve/revoke + staff self-service role request
CREATE OR REPLACE FUNCTION public.owner_approve_staff_line(
  p_binding uuid,
  p_user_id uuid,
  p_role public.app_role
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  IF p_role NOT IN ('admin','stock_staff','photo_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  UPDATE public.staff_line_bindings
  SET user_id = p_user_id,
      status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      revoked_at = NULL,
      requested_role = NULL,
      updated_at = now()
  WHERE id = p_binding;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding not found';
  END IF;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles p
  SET line_user_id = COALESCE(p.line_user_id, b.line_user_id)
  FROM public.staff_line_bindings b
  WHERE b.id = p_binding AND p.id = p_user_id;

  -- Notify the newly-approved staff member with a link into the app
  INSERT INTO public.notifications(user_id, for_staff, type, title, body, ref_id, link)
  VALUES (
    p_user_id, false,
    'staff_line_approved',
    'สิทธิ์พนักงานได้รับการอนุมัติ',
    'บัญชี LINE ของคุณผูกกับระบบเรียบร้อยแล้ว บทบาท: ' || p_role::text,
    p_binding,
    CASE WHEN p_role = 'admin' THEN '/admin/dashboard' ELSE '/pos' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_revoke_staff_line(p_binding uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  SELECT user_id INTO v_target FROM public.staff_line_bindings WHERE id = p_binding;
  UPDATE public.staff_line_bindings
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE id = p_binding;
  IF v_target IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_target
      AND role IN ('admin','stock_staff','photo_staff');

    INSERT INTO public.notifications(user_id, for_staff, type, title, body, ref_id, link)
    VALUES (
      v_target, false,
      'staff_line_revoked',
      'สิทธิ์พนักงานถูกเพิกถอน',
      'การเข้าถึงระบบพนักงานของคุณถูกยกเลิก กรุณาติดต่อเจ้าของกิจการหากคิดว่าไม่ถูกต้อง',
      p_binding,
      '/staff'
    );
  END IF;
END;
$$;

-- 2) Staff self-service role/permission request
CREATE OR REPLACE FUNCTION public.staff_request_role_change(
  p_role public.app_role,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_binding_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_staff_role(v_uid) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_role NOT IN ('admin','stock_staff','photo_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  UPDATE public.staff_line_bindings
  SET requested_role = p_role,
      note = NULLIF(btrim(coalesce(p_note,'')), ''),
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING id, display_name INTO v_binding_id, v_name;

  IF v_binding_id IS NULL THEN
    RAISE EXCEPTION 'no staff LINE binding for current user';
  END IF;

  INSERT INTO public.notifications(for_staff, type, title, body, ref_id, link)
  VALUES (
    true,
    'staff_role_request',
    'พนักงานขอปรับสิทธิ์',
    COALESCE(v_name, 'พนักงาน')
      || ' ขอบทบาท "' || p_role::text || '"'
      || COALESCE(' — ' || NULLIF(btrim(coalesce(p_note,'')), ''), ''),
    v_binding_id,
    '/admin/staff-line'
  );

  RETURN v_binding_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_request_role_change(public.app_role, text) TO authenticated;
