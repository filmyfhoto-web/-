
CREATE TABLE public.line_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_line_user_id text
);
CREATE INDEX line_link_codes_user_idx ON public.line_link_codes(user_id);
CREATE INDEX line_link_codes_expires_idx ON public.line_link_codes(expires_at);

GRANT SELECT ON public.line_link_codes TO authenticated;
GRANT ALL ON public.line_link_codes TO service_role;

ALTER TABLE public.line_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own line link codes select"
  ON public.line_link_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.generate_my_line_link_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_attempt int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  -- prune old/expired/consumed for this user
  DELETE FROM public.line_link_codes
    WHERE user_id = v_uid
      AND (expires_at < now() OR consumed_at IS NOT NULL);
  LOOP
    v_attempt := v_attempt + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    BEGIN
      INSERT INTO public.line_link_codes(code, user_id) VALUES (v_code, v_uid);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt > 8 THEN RAISE EXCEPTION 'could not allocate code'; END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_line_link_code(
  p_code text,
  p_line_user_id text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF p_code IS NULL OR p_line_user_id IS NULL THEN
    RAISE EXCEPTION 'missing params';
  END IF;
  UPDATE public.line_link_codes
     SET consumed_at = now(),
         consumed_line_user_id = p_line_user_id
   WHERE code = p_code
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'code invalid or expired';
  END IF;
  UPDATE public.profiles
     SET line_user_id = p_line_user_id,
         line_display_name = COALESCE(p_display_name, line_display_name)
   WHERE id = v_user;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (v_user, 'line_link_success', 'profile', v_user,
          jsonb_build_object('source','webhook','line_user_id', p_line_user_id));
  RETURN v_user;
END;
$$;
