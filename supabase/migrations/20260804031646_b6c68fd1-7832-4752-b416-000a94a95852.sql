DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relreplident
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname NOT IN (
        'line_oauth_states','line_otp_codes','line_link_otps','line_link_codes',
        'line_credentials','admin_line_enroll_codes','email_unsubscribe_tokens',
        'suppressed_emails','security_audit_log','store_invite_codes',
        'catalog_backfill_report','product_view_logs'
      )
  LOOP
    IF r.relreplident IS DISTINCT FROM 'f' THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', r.relname);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_publication p ON p.oid = pr.prpubid AND p.pubname='supabase_realtime'
      WHERE pr.prrelid = r.oid
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', r.relname);
    END IF;
  END LOOP;
END $$;