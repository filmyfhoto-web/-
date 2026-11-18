ALTER TABLE public.line_oauth_states ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS idx_activity_logs_action_created
  ON public.activity_logs (action, created_at DESC);

DROP FUNCTION IF EXISTS public.line_oauth_consume_state(text);
CREATE FUNCTION public.line_oauth_consume_state(p_state text)
 RETURNS TABLE(id uuid, code_verifier text, nonce text, next_path text, redirect_uri text, link_user_id uuid, trace_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.line_oauth_states
   WHERE expires_at < now() - interval '1 hour';

  RETURN QUERY
  UPDATE public.line_oauth_states s
     SET consumed_at = now()
   WHERE s.state = p_state
     AND s.consumed_at IS NULL
     AND s.expires_at > now()
  RETURNING s.id, s.code_verifier, s.nonce, s.next_path, s.redirect_uri, s.link_user_id, s.trace_id;
END;
$function$;

DROP FUNCTION IF EXISTS public.line_oauth_consume_handoff(text);
CREATE FUNCTION public.line_oauth_consume_handoff(p_handoff text)
 RETURNS TABLE(id uuid, handoff_payload jsonb, next_path text, trace_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_payload jsonb;
  v_next text;
  v_trace text;
BEGIN
  SELECT s.id, s.handoff_payload, s.next_path, s.trace_id
    INTO v_id, v_payload, v_next, v_trace
    FROM public.line_oauth_states s
   WHERE s.handoff = p_handoff
     AND s.handoff IS NOT NULL
     AND s.handoff_consumed_at IS NULL
     AND s.expires_at > now()
   FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.line_oauth_states s
     SET handoff_consumed_at = now(),
         handoff_payload = NULL
   WHERE s.id = v_id;

  id := v_id;
  handoff_payload := v_payload;
  next_path := v_next;
  trace_id := v_trace;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.line_oauth_consume_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.line_oauth_consume_handoff(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.line_oauth_consume_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.line_oauth_consume_handoff(text) TO service_role;