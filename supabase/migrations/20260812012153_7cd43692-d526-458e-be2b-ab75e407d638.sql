ALTER TABLE public.line_notification_channels
  ADD COLUMN IF NOT EXISTS queue_commands_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS queue_require_admin boolean NOT NULL DEFAULT true;

-- ตรวจสิทธิ์ผู้ส่งคำสั่งคิวจาก line_user_id
CREATE OR REPLACE FUNCTION public.line_queue_command_allowed(
  _line_user_id text,
  _channel_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.line_notification_channels%ROWTYPE;
  uid uuid;
  is_priv boolean := false;
  listed boolean := false;
  has_list boolean := false;
BEGIN
  SELECT * INTO ch FROM public.line_notification_channels WHERE id = _channel_id;
  IF NOT FOUND OR ch.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'room_not_bound');
  END IF;
  IF ch.queue_commands_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'queue_disabled');
  END IF;
  IF ch.queue_require_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'open_room', 'user_id', NULL);
  END IF;

  SELECT b.user_id INTO uid
  FROM public.staff_line_bindings b
  WHERE b.line_user_id = _line_user_id
    AND b.status = 'approved'
    AND b.revoked_at IS NULL
  LIMIT 1;

  IF uid IS NULL THEN
    SELECT l.user_id INTO uid FROM public.film_admin_line_links l
    WHERE l.line_user_id = _line_user_id LIMIT 1;
  END IF;

  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_linked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = uid AND r.role IN ('owner','admin')
  ) INTO is_priv;

  SELECT EXISTS (SELECT 1 FROM public.line_channel_admins a WHERE a.channel_id = _channel_id AND a.is_active)
    INTO has_list;
  SELECT EXISTS (
    SELECT 1 FROM public.line_channel_admins a
    WHERE a.channel_id = _channel_id AND a.user_id = uid AND a.is_active
  ) INTO listed;

  IF listed OR (is_priv AND NOT has_list) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'authorized', 'user_id', uid);
  END IF;

  RETURN jsonb_build_object('allowed', false, 'reason', 'not_authorized', 'user_id', uid);
END;
$$;

REVOKE ALL ON FUNCTION public.line_queue_command_allowed(text, uuid) FROM PUBLIC, anon, authenticated;

-- ลบ token/secret ออกจากฐานข้อมูล (ใช้ค่าจาก Environment แทน)
CREATE OR REPLACE FUNCTION public.admin_purge_line_credentials(_ids text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.line_credentials
     SET channel_access_token = NULL,
         channel_secret = NULL,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_line_credentials(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_line_credentials(text[]) TO authenticated;