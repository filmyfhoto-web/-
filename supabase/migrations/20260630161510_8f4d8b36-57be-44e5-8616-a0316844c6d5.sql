DROP POLICY IF EXISTS "anyone insert org (signup)" ON public.organizations;
CREATE POLICY "anyone insert org (signup)" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    approved = false
    AND price_group_id IS NULL
  );