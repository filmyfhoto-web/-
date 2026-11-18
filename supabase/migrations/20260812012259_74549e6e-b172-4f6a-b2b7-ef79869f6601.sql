CREATE OR REPLACE FUNCTION public.admin_line_channel_queue_flags(
  p_channel_id uuid,
  p_enabled boolean,
  p_require_admin boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.line_notification_channels
     SET queue_commands_enabled = COALESCE(p_enabled, queue_commands_enabled),
         queue_require_admin = COALESCE(p_require_admin, queue_require_admin),
         updated_at = now()
   WHERE id = p_channel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'channel_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_line_channel_queue_flags(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_line_channel_queue_flags(uuid, boolean, boolean) TO authenticated;