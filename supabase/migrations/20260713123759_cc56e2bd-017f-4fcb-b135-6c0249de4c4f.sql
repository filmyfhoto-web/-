
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'film_cash_advances','film_cash_advance_repayments',
    'film_cash_drawer_shifts','film_cash_drawer_transactions','film_cash_drawer_audit',
    'film_daily_reports','film_paper_withdrawals','film_transactions',
    'film_pos_receipts','film_pos_products','film_invoices',
    'film_payment_status_history','film_job_type_totals_archived','film_line_notification_settings',
    'film_admin_line_links'
  ];
  polname text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR polname IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END$$;

-- Staff-only access for financial + history/reporting tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'film_cash_advances','film_cash_advance_repayments',
    'film_cash_drawer_shifts','film_cash_drawer_transactions','film_cash_drawer_audit',
    'film_daily_reports','film_paper_withdrawals','film_transactions',
    'film_pos_receipts','film_pos_products','film_invoices',
    'film_payment_status_history','film_job_type_totals_archived','film_line_notification_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "staff all %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()))',
      t
    );
  END LOOP;
END$$;

-- film_admin_line_links: row-owner OR staff can read; only owner can insert/update/delete own row
CREATE POLICY "own or staff read admin line links"
  ON public.film_admin_line_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE POLICY "own insert admin line links"
  ON public.film_admin_line_links
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own update admin line links"
  ON public.film_admin_line_links
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own or staff delete admin line links"
  ON public.film_admin_line_links
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
