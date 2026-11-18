CREATE OR REPLACE FUNCTION public.line_oauth_consume_handoff(p_handoff text)
 RETURNS TABLE(id uuid, handoff_payload jsonb, next_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_payload jsonb;
  v_next text;
BEGIN
  SELECT s.id, s.handoff_payload, s.next_path
    INTO v_id, v_payload, v_next
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
  RETURN NEXT;
END;
$function$;