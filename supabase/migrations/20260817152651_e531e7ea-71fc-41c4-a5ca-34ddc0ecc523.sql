
-- Harden staff LINE binding role requests: only non-owner staff roles allowed,
-- and cap note length. Enforced at the data layer, not just in the RPC.
ALTER TABLE public.staff_line_bindings
  DROP CONSTRAINT IF EXISTS staff_line_bindings_requested_role_allowed;

UPDATE public.staff_line_bindings
  SET requested_role = NULL
  WHERE requested_role IS NOT NULL
    AND requested_role::text NOT IN ('admin','stock_staff','photo_staff');

ALTER TABLE public.staff_line_bindings
  ADD CONSTRAINT staff_line_bindings_requested_role_allowed
  CHECK (requested_role IS NULL OR requested_role::text IN ('admin','stock_staff','photo_staff'))
  NOT VALID;

ALTER TABLE public.staff_line_bindings
  DROP CONSTRAINT IF EXISTS staff_line_bindings_note_len;
ALTER TABLE public.staff_line_bindings
  ADD CONSTRAINT staff_line_bindings_note_len CHECK (note IS NULL OR char_length(note) <= 500) NOT VALID;

-- RPC: validate + bound the note server-side.
CREATE OR REPLACE FUNCTION public.staff_request_role_change(p_role app_role, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_binding_id uuid;
  v_name text;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_staff_role(v_uid) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_role::text NOT IN ('admin','stock_staff','photo_staff') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  v_note := NULLIF(btrim(coalesce(p_note,'')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long';
  END IF;

  UPDATE public.staff_line_bindings
  SET requested_role = p_role,
      note = v_note,
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
      || COALESCE(' — ' || v_note, ''),
    v_binding_id,
    '/admin/staff-line'
  );

  RETURN v_binding_id;
END;
$function$;
