DROP POLICY IF EXISTS "owners read settings" ON public.settings;
DROP POLICY IF EXISTS "owners write settings" ON public.settings;

CREATE POLICY "staff read settings" ON public.settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "staff write settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));