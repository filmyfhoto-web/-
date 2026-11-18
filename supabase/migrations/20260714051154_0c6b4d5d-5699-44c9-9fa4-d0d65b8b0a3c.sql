
DROP POLICY IF EXISTS "staff manage roles" ON public.user_roles;

-- Owners can fully manage all roles
CREATE POLICY "owners manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Non-owner staff (admins) may manage only non-privileged roles (not owner, not admin),
-- and cannot target owners or admins.
CREATE POLICY "staff manage non-privileged roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid())
  AND role NOT IN ('owner','admin')
  AND NOT public.has_role(user_id, 'owner')
  AND NOT public.has_role(user_id, 'admin')
)
WITH CHECK (
  public.is_staff(auth.uid())
  AND role NOT IN ('owner','admin')
  AND NOT public.has_role(user_id, 'owner')
  AND NOT public.has_role(user_id, 'admin')
);
