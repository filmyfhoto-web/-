CREATE OR REPLACE FUNCTION public.owner_approve_staff_line(p_binding uuid, p_user_id uuid, p_role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
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
  WHERE id = p_binding
  RETURNING COALESCE(display_name, line_user_id) INTO v_name;

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

  -- Audit notification for the admin team (notification center)
  INSERT INTO public.notifications(user_id, for_staff, type, title, body, ref_id, link)
  VALUES (
    NULL, true,
    'staff_line_approved',
    'อนุมัติสิทธิ์พนักงานแล้ว',
    COALESCE(v_name, 'พนักงาน') || ' ได้รับบทบาท ' || p_role::text,
    p_binding,
    '/admin/staff-line'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.owner_revoke_staff_line(p_binding uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_name text;
BEGIN
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  SELECT user_id, COALESCE(display_name, line_user_id)
    INTO v_target, v_name
  FROM public.staff_line_bindings WHERE id = p_binding;

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

  INSERT INTO public.notifications(user_id, for_staff, type, title, body, ref_id, link)
  VALUES (
    NULL, true,
    'staff_line_revoked',
    'เพิกถอนสิทธิ์พนักงานแล้ว',
    COALESCE(v_name, 'พนักงาน') || ' ถูกยกเลิกการเข้าถึงระบบพนักงาน',
    p_binding,
    '/admin/staff-line'
  );
END;
$function$;