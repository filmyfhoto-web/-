DROP POLICY IF EXISTS "owner manage film managers" ON public.film_shop_managers;
CREATE POLICY "owner or admin manage film managers" ON public.film_shop_managers
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));