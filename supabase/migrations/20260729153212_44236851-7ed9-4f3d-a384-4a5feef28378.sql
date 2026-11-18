CREATE OR REPLACE FUNCTION public.line_oauth_consume_handoff(p_handoff text)
 RETURNS TABLE(id uuid, handoff_payload jsonb, next_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH consumed AS (
    UPDATE public.line_oauth_states s
       SET handoff_consumed_at = now(),
           handoff_payload = NULL
     WHERE s.handoff = p_handoff
       AND s.handoff IS NOT NULL
       AND s.handoff_consumed_at IS NULL
       AND s.expires_at > now()
    RETURNING s.id AS sid, s.next_path AS snext
  )
  SELECT c.sid, o.handoff_payload, c.snext
    FROM consumed c
    JOIN public.line_oauth_states o ON FALSE
   WHERE FALSE;
END;
$function$;