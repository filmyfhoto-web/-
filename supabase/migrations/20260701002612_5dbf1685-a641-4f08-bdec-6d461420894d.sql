
CREATE SEQUENCE IF NOT EXISTS public.guest_order_seq START 1;

CREATE TABLE public.guest_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order','quotation')),
  line_user_id TEXT,
  line_display_name TEXT,
  line_picture_url TEXT,
  line_verified BOOLEAN NOT NULL DEFAULT false,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT,
  note TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'liff',
  handled_by UUID,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.guest_orders TO authenticated;
GRANT ALL ON public.guest_orders TO service_role;

ALTER TABLE public.guest_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view guest orders"
  ON public.guest_orders FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')
  );

CREATE POLICY "Staff can update guest orders"
  ON public.guest_orders FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')
  );

CREATE INDEX idx_guest_orders_status ON public.guest_orders(status);
CREATE INDEX idx_guest_orders_created_at ON public.guest_orders(created_at DESC);
CREATE INDEX idx_guest_orders_line_user ON public.guest_orders(line_user_id) WHERE line_user_id IS NOT NULL;
CREATE INDEX idx_guest_orders_phone ON public.guest_orders(customer_phone);

CREATE TRIGGER trg_guest_orders_set_updated_at
  BEFORE UPDATE ON public.guest_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.guest_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE,
  phone TEXT,
  name TEXT,
  address TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_guest_customers_phone_unique ON public.guest_customers(phone) WHERE phone IS NOT NULL;

GRANT SELECT ON public.guest_customers TO authenticated;
GRANT ALL ON public.guest_customers TO service_role;

ALTER TABLE public.guest_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view guest customers"
  ON public.guest_customers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')
  );

CREATE TRIGGER trg_guest_customers_set_updated_at
  BEFORE UPDATE ON public.guest_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.next_guest_order_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yymm TEXT;
  seq_no BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('guest_order_no'));
  yymm := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM');
  seq_no := nextval('public.guest_order_seq');
  RETURN 'GO-' || yymm || '-' || lpad(seq_no::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_guest_order_no() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_guest_order_no() TO service_role;
