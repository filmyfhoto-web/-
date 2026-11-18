-- Restrict suppliers table to staff only
DROP POLICY IF EXISTS "auth users view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "auth users insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "auth users update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "auth users delete suppliers" ON public.suppliers;

CREATE POLICY "staff view suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "staff insert suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE POLICY "staff update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE POLICY "staff delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated
  USING (public.is_staff_any(auth.uid()));