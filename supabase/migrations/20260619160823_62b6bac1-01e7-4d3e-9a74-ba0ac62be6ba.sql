
-- 1. Remove sensitive pricing tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.group_prices;
ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_prices;
ALTER PUBLICATION supabase_realtime DROP TABLE public.product_costs;

-- 2. Allow users to update their own organization (non-privileged fields)
CREATE POLICY "users update own org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
);

-- Trigger: prevent non-staff from changing privileged fields
CREATE OR REPLACE FUNCTION public.trg_org_protect_privileged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    NEW.approved := OLD.approved;
    NEW.price_group_id := OLD.price_group_id;
    NEW.type := OLD.type;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS org_protect_privileged ON public.organizations;
CREATE TRIGGER org_protect_privileged
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.trg_org_protect_privileged();
