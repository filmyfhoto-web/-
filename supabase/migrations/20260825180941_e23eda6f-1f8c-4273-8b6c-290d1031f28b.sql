-- 1) admin_email_allowlist: explicit admin-only write policies (was fail-closed/implicit)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_email_allowlist TO authenticated;
GRANT ALL ON public.admin_email_allowlist TO service_role;

DROP POLICY IF EXISTS "Admins can insert allowlist" ON public.admin_email_allowlist;
CREATE POLICY "Admins can insert allowlist" ON public.admin_email_allowlist
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update allowlist" ON public.admin_email_allowlist;
CREATE POLICY "Admins can update allowlist" ON public.admin_email_allowlist
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete allowlist" ON public.admin_email_allowlist;
CREATE POLICY "Admins can delete allowlist" ON public.admin_email_allowlist
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) film_quick_items: standardize on is_staff_any() helper
DROP POLICY IF EXISTS "Staff can read quick items" ON public.film_quick_items;
CREATE POLICY "Staff can read quick items" ON public.film_quick_items
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert quick items" ON public.film_quick_items;
CREATE POLICY "Staff can insert quick items" ON public.film_quick_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "Staff can update quick items" ON public.film_quick_items;
CREATE POLICY "Staff can update quick items" ON public.film_quick_items
  FOR UPDATE TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete quick items" ON public.film_quick_items;
CREATE POLICY "Staff can delete quick items" ON public.film_quick_items
  FOR DELETE TO authenticated
  USING (public.is_staff_any(auth.uid()));

-- 3) tutorial_video_views: no anonymous writes
DROP POLICY IF EXISTS "anyone can log a tutorial view" ON public.tutorial_video_views;
CREATE POLICY "signed-in users can log a tutorial view" ON public.tutorial_video_views
  FOR INSERT TO authenticated
  WITH CHECK (
    length(session_id) >= 6 AND length(session_id) <= 64
    AND length(video_key) >= 1 AND length(video_key) <= 64
    AND length(step_key) >= 1 AND length(step_key) <= 64
  );

REVOKE INSERT ON public.tutorial_video_views FROM anon;
GRANT INSERT ON public.tutorial_video_views TO authenticated;
GRANT ALL ON public.tutorial_video_views TO service_role;