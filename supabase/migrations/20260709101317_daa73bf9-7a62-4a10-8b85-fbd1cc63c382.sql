DROP POLICY IF EXISTS "users insert own logs" ON public.activity_logs;
CREATE POLICY "users insert own logs" ON public.activity_logs
FOR INSERT TO authenticated
WITH CHECK ((user_id = auth.uid()) AND (is_staff(auth.uid()) OR (action = ANY (ARRAY['submit_order'::text, 'login'::text, 'logout'::text, 'accept_terms'::text, 'accept_privacy'::text, 'revoke_consent'::text]))));
REVOKE INSERT ON public.activity_logs FROM anon;