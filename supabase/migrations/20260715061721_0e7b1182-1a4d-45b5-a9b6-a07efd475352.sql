
-- 1) Table
CREATE TABLE IF NOT EXISTS public.customer_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  school_or_org text NOT NULL DEFAULT '',
  seller_name text NOT NULL DEFAULT '',
  document_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Bangkok')::date,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT '',
  request_quotation boolean NOT NULL DEFAULT false,
  request_delivery_note boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'submitted', -- draft | submitted | converted | cancelled
  source text NOT NULL DEFAULT 'customer',   -- customer | admin
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_purchase_orders_user_idx
  ON public.customer_purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS customer_purchase_orders_created_idx
  ON public.customer_purchase_orders(created_at DESC);

-- 2) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_purchase_orders TO authenticated;
GRANT ALL ON public.customer_purchase_orders TO service_role;

-- 3) RLS
ALTER TABLE public.customer_purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpo_owner_all" ON public.customer_purchase_orders;
CREATE POLICY "cpo_owner_all"
  ON public.customer_purchase_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cpo_staff_all" ON public.customer_purchase_orders;
CREATE POLICY "cpo_staff_all"
  ON public.customer_purchase_orders
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.cpo_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cpo_touch_updated_at ON public.customer_purchase_orders;
CREATE TRIGGER cpo_touch_updated_at
  BEFORE UPDATE ON public.customer_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.cpo_touch_updated_at();

-- 5) PO number generator: PO-YYYYMM-####
CREATE OR REPLACE FUNCTION public.next_customer_po_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yyyymm text := to_char((now() AT TIME ZONE 'Asia/Bangkok'), 'YYYYMM');
  prefix text := 'PO-' || yyyymm || '-';
  next_seq int;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN po_number LIKE prefix || '%'
         THEN NULLIF(regexp_replace(po_number, '^' || prefix, ''), '')::int
         ELSE 0 END), 0) + 1
    INTO next_seq
  FROM public.customer_purchase_orders;
  RETURN prefix || lpad(next_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_customer_po_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_customer_po_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_customer_po_number() TO service_role;
