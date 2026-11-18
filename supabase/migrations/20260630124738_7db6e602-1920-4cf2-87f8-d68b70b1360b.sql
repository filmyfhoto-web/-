
-- Index for unread staff notifications
CREATE INDEX IF NOT EXISTS idx_notifications_staff_unread
  ON public.notifications (for_staff, read, created_at DESC);

-- RPC: approve / reject join request with audit log
CREATE OR REPLACE FUNCTION public.admin_decide_org_join(
  p_org_id uuid,
  p_approve boolean,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_staff(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id, name, approved INTO v_org FROM public.organizations WHERE id = p_org_id;
  IF v_org.id IS NULL THEN RAISE EXCEPTION 'organization not found'; END IF;

  IF p_approve THEN
    UPDATE public.organizations SET approved = true, updated_at = now() WHERE id = p_org_id;
  ELSE
    UPDATE public.organizations SET approved = false, updated_at = now() WHERE id = p_org_id;
  END IF;

  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (
    v_uid,
    CASE WHEN p_approve THEN 'org_join_approve' ELSE 'org_join_reject' END,
    'organization', p_org_id,
    jsonb_build_object('org_name', v_org.name, 'reason', p_reason, 'previous_approved', v_org.approved)
  );

  -- notify members of the org
  INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id, link)
  SELECT false, p.id, 'org_decision',
         CASE WHEN p_approve THEN 'หน่วยงานของคุณได้รับการอนุมัติ' ELSE 'คำขอเข้าร่วมหน่วยงานถูกปฏิเสธ' END,
         left(coalesce(v_org.name,'') || COALESCE(' — ' || p_reason, ''), 500),
         p_org_id,
         '/account'
  FROM public.profiles p WHERE p.organization_id = p_org_id;

  -- mark related staff notifications as read
  UPDATE public.notifications SET read = true
   WHERE for_staff = true AND type = 'new_signup' AND ref_id = p_org_id AND read = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_decide_org_join(uuid, boolean, text) TO authenticated;
