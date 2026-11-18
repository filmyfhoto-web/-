CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  tax_id text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users view suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users insert suppliers" ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth users update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth users delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders(supplier_id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_snapshot jsonb;