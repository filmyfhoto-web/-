DROP POLICY IF EXISTS "service_write_rule_state" ON public.admin_alert_rule_state;

DROP POLICY IF EXISTS "staff manage non-privileged roles" ON public.user_roles;

CREATE POLICY "admins manage non-privileged roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT public.has_role(user_id, 'owner'::app_role)
  AND NOT public.has_role(user_id, 'admin'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND role <> ALL (ARRAY['owner'::app_role, 'admin'::app_role])
  AND NOT public.has_role(user_id, 'owner'::app_role)
  AND NOT public.has_role(user_id, 'admin'::app_role)
);