DO $$
DECLARE r record;
  keep text[] := ARRAY[
    'get_public_settings','get_public_liff_config','get_current_consent_versions',
    'get_guest_order_detail','get_guest_order_receipt','get_guest_orders','guest_approve_order',
    'next_guest_order_no','get_nw_work_order_public','get_prices_by_token','get_order_status_events',
    'cpo_get_by_token','cpo_customer_respond','resolve_org_slug','org_by_slug','resolve_school_token',
    'find_profile_by_phone_for_login','check_line_binding_by_phone','bind_line_user_by_token',
    'consume_line_link_code','log_line_link_event','normalize_phone',
    'line_oauth_consume_state','line_oauth_consume_handoff','list_line_stores','realtime_topic_allowed'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    IF r.proname = ANY(keep) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;
END $$;