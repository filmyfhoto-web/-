-- 1. line_login_diagnostics: no direct client inserts; edge functions (service role) only.
DROP POLICY IF EXISTS "Authenticated can add line login diagnostics" ON public.line_login_diagnostics;
REVOKE INSERT ON public.line_login_diagnostics FROM authenticated, anon;
GRANT ALL ON public.line_login_diagnostics TO service_role;

-- 2. notifications: staff may only create staff-facing notifications (no arbitrary user targeting).
DROP POLICY IF EXISTS "staff insert non-sensitive notifs" ON public.notifications;
CREATE POLICY "staff insert staff-facing notifs"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  is_staff(auth.uid())
  AND is_allowed_staff_notification_type(type)
  AND for_staff = true
  AND user_id IS NULL
);

-- 3. profiles.line_user_id uniqueness (guard triggers already block self-service edits).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_line_user_id_key
  ON public.profiles (line_user_id) WHERE line_user_id IS NOT NULL;