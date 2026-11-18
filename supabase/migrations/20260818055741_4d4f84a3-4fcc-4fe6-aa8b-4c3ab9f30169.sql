CREATE OR REPLACE FUNCTION public.profile_staff_fields_unchanged(_id uuid, _active boolean, _disabled_at timestamptz, _disabled_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _id
      AND p.staff_active IS NOT DISTINCT FROM _active
      AND p.staff_disabled_at IS NOT DISTINCT FROM _disabled_at
      AND p.staff_disabled_by IS NOT DISTINCT FROM _disabled_by
  )
$$;

REVOKE ALL ON FUNCTION public.profile_staff_fields_unchanged(uuid, boolean, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_staff_fields_unchanged(uuid, boolean, timestamptz, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;

CREATE POLICY "users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((auth.uid() = id) OR public.is_staff(auth.uid()))
WITH CHECK (
  -- Owners/admins may manage staff status, but only on OTHER people's profiles.
  ((auth.uid() <> id) AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (
    -- Everyone else (including self-updates and plain staff) must leave the
    -- staff activation fields exactly as they are.
    public.profile_staff_fields_unchanged(id, staff_active, staff_disabled_at, staff_disabled_by)
    AND (
      public.is_staff(auth.uid())
      OR (
        (auth.uid() = id)
        AND (NOT (organization_id IS DISTINCT FROM (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())))
      )
    )
  )
);