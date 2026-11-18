CREATE TABLE public.line_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code char(6) NOT NULL,
  purpose text NOT NULL DEFAULT 'login',
  sent_to_line_user_id text,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_otp_codes TO authenticated;
GRANT ALL ON public.line_otp_codes TO service_role;

ALTER TABLE public.line_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own OTP codes"
ON public.line_otp_codes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO service_role;

CREATE OR REPLACE FUNCTION public.find_profile_by_phone_for_login(p_phone text)
RETURNS TABLE(id uuid, email text, line_user_id text, line_display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.line_user_id, p.line_display_name
  FROM public.profiles p
  WHERE normalize_phone(p.phone) = normalize_phone(p_phone)
    AND p.line_user_id IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_profile_by_phone_for_login(text) TO service_role;
