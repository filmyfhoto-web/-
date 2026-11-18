CREATE OR REPLACE FUNCTION public.log_line_link_event(p_event text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_event NOT IN (
    'line_link_start','line_link_success','line_link_error',
    'line_link_test_ok','line_link_test_error','line_unlink',
    'liff_init_fail','liff_login_loop','link_verify_fail'
  ) THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (v_uid, p_event, 'profile', v_uid, COALESCE(p_detail,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;