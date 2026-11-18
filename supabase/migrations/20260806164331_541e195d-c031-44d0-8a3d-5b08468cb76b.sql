DROP POLICY IF EXISTS "own insert admin line links" ON public.film_admin_line_links;
DROP POLICY IF EXISTS "own update admin line links" ON public.film_admin_line_links;

CREATE POLICY "own insert admin line links"
  ON public.film_admin_line_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND line_user_id IS NULL);

CREATE POLICY "own update admin line links"
  ON public.film_admin_line_links
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND line_user_id IS NULL);