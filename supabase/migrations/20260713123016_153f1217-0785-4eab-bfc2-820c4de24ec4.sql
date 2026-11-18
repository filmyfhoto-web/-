
-- Restrict film_customers, film_employees, film_cash_advances to staff only
DROP POLICY IF EXISTS auth_all ON public.film_customers;
CREATE POLICY "Staff manage film_customers" ON public.film_customers
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS auth_all ON public.film_employees;
CREATE POLICY "Staff manage film_employees" ON public.film_employees
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS auth_all ON public.film_cash_advances;
CREATE POLICY "Staff manage film_cash_advances" ON public.film_cash_advances
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));
