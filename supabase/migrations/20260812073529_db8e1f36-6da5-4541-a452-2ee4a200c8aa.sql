DROP POLICY IF EXISTS store_staff_manage_store_invites ON public.admin_invitations;

CREATE POLICY store_staff_read_store_invites ON public.admin_invitations
FOR SELECT TO authenticated
USING (store_id IS NOT NULL AND public.is_staff_of_store(auth.uid(), store_id));

CREATE POLICY store_staff_insert_store_invites ON public.admin_invitations
FOR INSERT TO authenticated
WITH CHECK (
  store_id IS NOT NULL
  AND public.is_staff_of_store(auth.uid(), store_id)
  AND (role::text <> ALL (ARRAY['owner','admin']) OR public.has_role(auth.uid(), 'owner'::app_role))
);

CREATE POLICY store_staff_update_store_invites ON public.admin_invitations
FOR UPDATE TO authenticated
USING (store_id IS NOT NULL AND public.is_staff_of_store(auth.uid(), store_id))
WITH CHECK (
  store_id IS NOT NULL
  AND public.is_staff_of_store(auth.uid(), store_id)
  AND (role::text <> ALL (ARRAY['owner','admin']) OR public.has_role(auth.uid(), 'owner'::app_role))
);

CREATE POLICY store_staff_delete_store_invites ON public.admin_invitations
FOR DELETE TO authenticated
USING (store_id IS NOT NULL AND public.is_staff_of_store(auth.uid(), store_id));