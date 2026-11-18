
CREATE OR REPLACE FUNCTION public.has_accepted_staff_invite(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_invitations i
    WHERE i.accepted_by = _user_id
      AND i.status = 'accepted'
      AND i.role = _role::text
      AND (
        i.store_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff_stores s
          WHERE s.user_id = _user_id AND s.store_id = i.store_id
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_accepted_staff_invite(_actor_id uuid, _user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_invitations i
    WHERE i.accepted_by = _user_id
      AND i.status = 'accepted'
      AND i.role = _role::text
      AND (
        i.store_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff_stores s
          WHERE s.user_id = _user_id AND s.store_id = i.store_id
        )
      )
      AND (
        i.invited_by = _actor_id
        OR public.has_role(_actor_id, 'owner'::app_role)
        OR (
          i.store_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.staff_stores s2
            WHERE s2.user_id = _actor_id AND s2.store_id = i.store_id
          )
        )
      )
  )
$function$;

DROP POLICY IF EXISTS "admins manage invited staff roles" ON public.user_roles;
CREATE POLICY "admins manage invited staff roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT public.has_role(user_id, 'owner'::app_role)
  AND NOT public.has_role(user_id, 'admin'::app_role)
  AND public.has_accepted_staff_invite(auth.uid(), user_id, role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT public.has_role(user_id, 'owner'::app_role)
  AND NOT public.has_role(user_id, 'admin'::app_role)
  AND public.has_accepted_staff_invite(auth.uid(), user_id, role)
);

ALTER PUBLICATION supabase_realtime DROP TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.staff_permissions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_purchase_orders;
