DROP POLICY IF EXISTS consent_versions_public_read ON public.consent_policy_versions;
CREATE POLICY consent_versions_signed_in_read ON public.consent_policy_versions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.consent_policy_versions FROM anon;