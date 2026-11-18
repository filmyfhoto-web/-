-- 1) One-time, short-lived LINE OAuth state storage (backend only)
CREATE TABLE IF NOT EXISTS public.line_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  next_path text NOT NULL DEFAULT '/account',
  redirect_uri text NOT NULL,
  handoff text UNIQUE,
  handoff_payload jsonb,
  consumed_at timestamptz,
  handoff_consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.line_oauth_states TO service_role;
ALTER TABLE public.line_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated have no access at all.

CREATE INDEX IF NOT EXISTS line_oauth_states_expires_idx ON public.line_oauth_states (expires_at);

CREATE TRIGGER line_oauth_states_touch
  BEFORE UPDATE ON public.line_oauth_states
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Atomic one-time consumption of an authorization state.
CREATE OR REPLACE FUNCTION public.line_oauth_consume_state(p_state text)
RETURNS TABLE (id uuid, code_verifier text, nonce text, next_path text, redirect_uri text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.line_oauth_states
   WHERE expires_at < now() - interval '1 hour';

  RETURN QUERY
  UPDATE public.line_oauth_states s
     SET consumed_at = now()
   WHERE s.state = p_state
     AND s.consumed_at IS NULL
     AND s.expires_at > now()
  RETURNING s.id, s.code_verifier, s.nonce, s.next_path, s.redirect_uri;
END;
$$;

REVOKE ALL ON FUNCTION public.line_oauth_consume_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.line_oauth_consume_state(text) TO service_role;

-- Atomic one-time consumption of the post-callback handoff code.
CREATE OR REPLACE FUNCTION public.line_oauth_consume_handoff(p_handoff text)
RETURNS TABLE (id uuid, handoff_payload jsonb, next_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.line_oauth_states s
     SET handoff_consumed_at = now(),
         handoff_payload = NULL
   WHERE s.handoff = p_handoff
     AND s.handoff IS NOT NULL
     AND s.handoff_consumed_at IS NULL
     AND s.expires_at > now()
  RETURNING s.id, s.handoff_payload, s.next_path;
END;
$$;

REVOKE ALL ON FUNCTION public.line_oauth_consume_handoff(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.line_oauth_consume_handoff(text) TO service_role;

-- 2) Notification hardening -------------------------------------------------

-- Clients (even staff) may no longer insert sensitive/system alerts.
DROP POLICY IF EXISTS "staff insert notifs" ON public.notifications;
CREATE POLICY "staff insert non-sensitive notifs"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND type NOT IN (
      'line_login_failure',
      'line_link_failure',
      'webhook_failure',
      'endpoint_failure',
      'security_alert'
    )
    AND type NOT LIKE '%_failure'
  );

-- Server-side alert creation with dedupe / rate limiting.
CREATE OR REPLACE FUNCTION public.notify_staff_alert(
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL,
  p_dedupe_minutes integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window integer;
  v_existing uuid;
  v_id uuid;
BEGIN
  v_window := COALESCE(
    p_dedupe_minutes,
    CASE WHEN p_type IN ('line_login_failure','line_link_failure','webhook_failure','endpoint_failure')
           OR p_type LIKE '%_failure'
         THEN 10 ELSE 0 END
  );

  IF v_window > 0 THEN
    SELECT n.id INTO v_existing
      FROM public.notifications n
     WHERE n.for_staff
       AND n.type = p_type
       AND n.ref_id IS NOT DISTINCT FROM p_ref_id
       AND n.created_at > now() - make_interval(mins => v_window)
     ORDER BY n.created_at DESC
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing; -- rate limited: reuse the recent alert
    END IF;
  END IF;

  INSERT INTO public.notifications (type, title, body, link, ref_id, for_staff, read)
  VALUES (p_type, p_title, p_body, p_link, p_ref_id, true, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_staff_alert(text, text, text, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_alert(text, text, text, text, uuid, integer) TO service_role;

-- Authorized read-state changes.
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  UPDATE public.notifications n
     SET read = true
   WHERE n.id = p_id
     AND (n.user_id = auth.uid() OR (n.for_staff AND public.is_staff(auth.uid())))
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  WITH upd AS (
    UPDATE public.notifications n
       SET read = true
     WHERE n.read = false
       AND (n.user_id = auth.uid() OR (n.for_staff AND public.is_staff(auth.uid())))
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;