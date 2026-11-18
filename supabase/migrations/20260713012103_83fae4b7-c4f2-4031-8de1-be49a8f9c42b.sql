DROP FUNCTION IF EXISTS public.redeem_store_invite_code(text);

CREATE OR REPLACE FUNCTION public.redeem_store_invite_code(_code text)
RETURNS TABLE(out_store_id uuid, out_role app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.store_invite_codes%ROWTYPE;
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
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found_or_expired';
  END IF;

  UPDATE public.store_invite_codes
    SET use_count = use_count + 1
    WHERE id = v_row.id;

  INSERT INTO public.staff_stores (user_id, store_id)
    VALUES (v_uid, v_row.store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, v_row.role)
    ON CONFLICT (user_id, role) DO NOTHING;

  out_store_id := v_row.store_id;
  out_role := v_row.role;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_store_invite_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite_code(text) TO authenticated;