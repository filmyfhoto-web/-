ALTER TABLE public.line_oauth_states
  ADD COLUMN IF NOT EXISTS link_user_id uuid;

DROP FUNCTION IF EXISTS public.line_oauth_consume_state(text);

CREATE FUNCTION public.line_oauth_consume_state(p_state text)
 RETURNS TABLE(id uuid, code_verifier text, nonce text, next_path text, redirect_uri text, link_user_id uuid)
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
  RETURNING s.id, s.code_verifier, s.nonce, s.next_path, s.redirect_uri, s.link_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.line_oauth_consume_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.line_oauth_consume_state(text) TO service_role;