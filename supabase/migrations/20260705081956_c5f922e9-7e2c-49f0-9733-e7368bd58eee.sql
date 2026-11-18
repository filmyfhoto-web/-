-- Prevent users from self-assigning organization_id on profiles.
-- Only staff may set/change organization_id. Users may still create and update
-- their own profile row for other columns.

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;

CREATE POLICY "users insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND (organization_id IS NULL OR public.is_staff(auth.uid()))
);

CREATE POLICY "users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((auth.uid() = id) OR public.is_staff(auth.uid()))
WITH CHECK (
  (
    -- Staff can change anything.
    public.is_staff(auth.uid())
  )
  OR (
    -- Non-staff editing their own row: must keep organization_id unchanged.
    auth.uid() = id
    AND organization_id IS NOT DISTINCT FROM (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  )
);