-- 1) user_roles: admins may only touch roles for users who accepted an invitation for that same role
CREATE OR REPLACE FUNCTION public.has_accepted_staff_invite(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_invitations i
    WHERE i.accepted_by = _user_id
      AND i.status = 'accepted'
      AND i.role = _role::text
  )
$$;

REVOKE ALL ON FUNCTION public.has_accepted_staff_invite(uuid, app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_accepted_staff_invite(uuid, app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "admins manage non-privileged roles" ON public.user_roles;

CREATE POLICY "admins manage invited staff roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT has_role(user_id, 'owner'::app_role)
  AND NOT has_role(user_id, 'admin'::app_role)
  AND public.has_accepted_staff_invite(user_id, role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT has_role(user_id, 'owner'::app_role)
  AND NOT has_role(user_id, 'admin'::app_role)
  AND public.has_accepted_staff_invite(user_id, role)
);

-- 2) Realtime: stop broadcasting PII tables that no client subscribes to
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.guest_customers;
ALTER PUBLICATION supabase_realtime DROP TABLE public.line_account_links;
ALTER PUBLICATION supabase_realtime DROP TABLE public.line_phone_bindings;
ALTER PUBLICATION supabase_realtime DROP TABLE public.login_events;
ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_invitations;
ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_email_allowlist;
ALTER PUBLICATION supabase_realtime DROP TABLE public.email_send_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.email_send_state;
ALTER PUBLICATION supabase_realtime DROP TABLE public.line_webhook_events;
ALTER PUBLICATION supabase_realtime DROP TABLE public.line_login_diagnostics;
ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.rds_activity_logs;