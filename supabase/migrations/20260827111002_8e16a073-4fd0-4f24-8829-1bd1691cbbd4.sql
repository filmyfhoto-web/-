
-- Public storefront config: only active rows are visible to the public
DROP POLICY IF EXISTS feature_columns_public_read ON public.shop_feature_columns;
CREATE POLICY feature_columns_public_read ON public.shop_feature_columns
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS feature_items_public_read ON public.shop_feature_items;
CREATE POLICY feature_items_public_read ON public.shop_feature_items
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS shortcuts_public_read ON public.shop_service_shortcuts;
CREATE POLICY shortcuts_public_read ON public.shop_service_shortcuts
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_staff_any(auth.uid()));

-- Notifications: staff updates must not re-target a row to another user
DROP POLICY IF EXISTS "users update own notifs" ON public.notifications;
CREATE POLICY "users update own notifs" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR (for_staff AND public.is_staff(auth.uid())))
  WITH CHECK ((user_id = auth.uid()) OR (for_staff AND public.is_staff(auth.uid())));
