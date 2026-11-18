
CREATE OR REPLACE FUNCTION public.admin_create_org(p_name text, p_price_group_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'ชื่อโรงเรียน/หน่วยงานสั้นเกินไป';
  END IF;
  INSERT INTO public.organizations (name, price_group_id, approved)
  VALUES (v_name, p_price_group_id, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_org(text, uuid) TO authenticated;
