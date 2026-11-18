
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS line_picture_url text,
  ADD COLUMN IF NOT EXISTS line_verified_at timestamptz;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS line_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS line_verified_by uuid;

CREATE OR REPLACE FUNCTION public.link_my_line_profile(
  p_line_user_id text,
  p_display_name text DEFAULT NULL,
  p_picture_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_line_user_id IS NULL OR length(btrim(p_line_user_id)) = 0 THEN
    RAISE EXCEPTION 'line_user_id required';
  END IF;

  UPDATE public.profiles
     SET line_user_id = p_line_user_id,
         line_display_name = COALESCE(p_display_name, line_display_name),
         line_picture_url = COALESCE(p_picture_url, line_picture_url),
         line_verified_at = now()
   WHERE id = v_uid
   RETURNING organization_id INTO v_org;

  INSERT INTO public.line_account_links(line_user_id, display_name, picture_url, verified_at, last_seen_at)
  VALUES (p_line_user_id, p_display_name, p_picture_url, now(), now())
  ON CONFLICT (line_user_id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, line_account_links.display_name),
    picture_url = COALESCE(EXCLUDED.picture_url, line_account_links.picture_url),
    verified_at = now(),
    last_seen_at = now();

  IF v_org IS NOT NULL THEN
    UPDATE public.organizations
       SET line_verified_at = now(),
           line_verified_by = v_uid
     WHERE id = v_org AND line_verified_at IS NULL;
  END IF;

  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (v_uid, 'line.profile_verified', 'profile', v_uid,
          jsonb_build_object('line_user_id', p_line_user_id, 'display_name', p_display_name, 'organization_id', v_org));

  RETURN jsonb_build_object('ok', true, 'organization_id', v_org, 'verified_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_my_line_profile(text, text, text) TO authenticated;
