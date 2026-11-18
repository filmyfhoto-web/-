-- ============ customer_addresses ============
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  address_line text NOT NULL,
  subdistrict text,
  district text,
  province text,
  postcode text,
  note text,
  is_default boolean NOT NULL DEFAULT false,
  is_pickup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own addresses" ON public.customer_addresses;
CREATE POLICY "own addresses" ON public.customer_addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON public.customer_addresses(user_id);

-- ============ order_files ============
CREATE TABLE IF NOT EXISTS public.order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  size_bytes bigint,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_files TO authenticated;
GRANT ALL ON public.order_files TO service_role;
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own order files" ON public.order_files;
CREATE POLICY "own order files" ON public.order_files
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS order_files_user_idx ON public.order_files(user_id);
CREATE INDEX IF NOT EXISTS order_files_order_idx ON public.order_files(order_id);

-- ============ document_receipts ============
CREATE TABLE IF NOT EXISTS public.document_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_receipts TO authenticated;
GRANT ALL ON public.document_receipts TO service_role;
ALTER TABLE public.document_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own document receipts" ON public.document_receipts;
CREATE POLICY "own document receipts" ON public.document_receipts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- ============ coupons ============
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'amount',
  discount_value numeric NOT NULL DEFAULT 0,
  min_subtotal numeric NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read active coupons" ON public.coupons;
CREATE POLICY "read active coupons" ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true OR public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "staff manage coupons" ON public.coupons;
CREATE POLICY "staff manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ user_coupons ============
CREATE TABLE IF NOT EXISTS public.user_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  used_at timestamptz,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, coupon_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_coupons TO authenticated;
GRANT ALL ON public.user_coupons TO service_role;
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own user coupons" ON public.user_coupons;
CREATE POLICY "own user coupons" ON public.user_coupons
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS user_coupons_user_idx ON public.user_coupons(user_id);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.customer_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_addresses_touch ON public.customer_addresses;
CREATE TRIGGER customer_addresses_touch BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.customer_touch_updated_at();
DROP TRIGGER IF EXISTS order_files_touch ON public.order_files;
CREATE TRIGGER order_files_touch BEFORE UPDATE ON public.order_files
  FOR EACH ROW EXECUTE FUNCTION public.customer_touch_updated_at();
DROP TRIGGER IF EXISTS document_receipts_touch ON public.document_receipts;
CREATE TRIGGER document_receipts_touch BEFORE UPDATE ON public.document_receipts
  FOR EACH ROW EXECUTE FUNCTION public.customer_touch_updated_at();
DROP TRIGGER IF EXISTS coupons_touch ON public.coupons;
CREATE TRIGGER coupons_touch BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.customer_touch_updated_at();
DROP TRIGGER IF EXISTS user_coupons_touch ON public.user_coupons;
CREATE TRIGGER user_coupons_touch BEFORE UPDATE ON public.user_coupons
  FOR EACH ROW EXECUTE FUNCTION public.customer_touch_updated_at();