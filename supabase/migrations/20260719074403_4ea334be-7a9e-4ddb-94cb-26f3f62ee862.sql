DROP POLICY IF EXISTS "Users can manage their own OTP codes" ON public.line_otp_codes;

CREATE POLICY "Users can view their own OTP codes"
ON public.line_otp_codes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.line_otp_codes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.line_otp_codes FROM anon;
GRANT SELECT ON public.line_otp_codes TO authenticated;
GRANT ALL ON public.line_otp_codes TO service_role;