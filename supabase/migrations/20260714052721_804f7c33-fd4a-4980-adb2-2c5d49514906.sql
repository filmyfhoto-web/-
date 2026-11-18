DROP POLICY IF EXISTS "auth_all" ON public.film_job_requests;
DROP POLICY IF EXISTS "auth_all" ON public.film_shop_settings;

CREATE POLICY "staff manage film_job_requests"
  ON public.film_job_requests
  FOR ALL
  TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE POLICY "staff manage film_shop_settings"
  ON public.film_shop_settings
  FOR ALL
  TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));