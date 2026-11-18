CREATE OR REPLACE FUNCTION public.preview_store_invite_code(_code text)
RETURNS TABLE(
  out_store_id uuid,
  out_role app_role,
  out_expires_at timestamptz,
  out_uses_left int,
  out_store_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.store_invite_codes%ROWTYPE;
  v_name text;
  v_is_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _code IS NULL OR _code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'invalid_code_format';
  END IF;

  SELECT * INTO v_row
  FROM public.store_invite_codes
  WHERE code = _code
    AND expires_at > now()
    AND use_count < max_uses
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found_or_expired';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staff_stores s
    WHERE s.user_id = v_uid AND s.store_id = v_row.store_id
  ) OR public.has_role(v_uid, 'admin'::app_role)
  INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not_authorized_to_preview';
  END IF;

  SELECT name INTO v_name FROM public.rds_stores WHERE id = v_row.store_id;

  out_store_id := v_row.store_id;
  out_role := v_row.role;
  out_expires_at := v_row.expires_at;
  out_uses_left := v_row.max_uses - v_row.use_count;
  out_store_name := v_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_store_invite_code(text) FROM public;
REVOKE ALL ON FUNCTION public.preview_store_invite_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_store_invite_code(text) TO authenticated;