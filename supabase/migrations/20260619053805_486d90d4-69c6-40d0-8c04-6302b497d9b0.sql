
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('owner','admin','customer');
CREATE TYPE public.order_status AS ENUM ('pending_quote','quoted','approved','picking','ready','completed','cancelled');
CREATE TYPE public.po_status AS ENUM ('draft','ordered','received');
CREATE TYPE public.stock_move_type AS ENUM ('in','out','adjust');
CREATE TYPE public.customer_type AS ENUM ('school','office','general');
CREATE TYPE public.doc_type AS ENUM ('quotation','purchase_order','delivery_note');

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- USER ROLES (separate table, mandatory pattern)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "staff manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- PRICE GROUPS
CREATE TABLE public.price_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_groups TO authenticated, anon;
GRANT ALL ON public.price_groups TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.price_groups TO authenticated;
ALTER TABLE public.price_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read price groups" ON public.price_groups FOR SELECT USING (true);
CREATE POLICY "staff write price groups" ON public.price_groups FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.customer_type NOT NULL DEFAULT 'general',
  contact_name text,
  phone text,
  email text,
  line_id text,
  address text,
  price_group_id uuid REFERENCES public.price_groups(id) ON DELETE SET NULL,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profile_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "staff delete profile" ON public.profiles FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- Org policies (depend on profiles)
CREATE POLICY "users read own org" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "anyone insert org (signup)" ON public.organizations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff update org" ON public.organizations FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff delete org" ON public.organizations FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.raw_user_meta_data->>'phone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "staff write categories" ON public.categories FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  description text,
  unit text NOT NULL DEFAULT 'ชิ้น',
  image_url text,
  stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  standard_price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_prod_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "anyone read active products" ON public.products FOR SELECT USING (active OR public.is_staff(auth.uid()));
CREATE POLICY "staff write products" ON public.products FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- GROUP PRICES
CREATE TABLE public.group_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_group_id uuid NOT NULL REFERENCES public.price_groups(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(price_group_id, product_id)
);
GRANT SELECT ON public.group_prices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.group_prices TO authenticated;
GRANT ALL ON public.group_prices TO service_role;
ALTER TABLE public.group_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read group prices" ON public.group_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write group prices" ON public.group_prices FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- CUSTOMER PRICES
CREATE TABLE public.customer_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_prices TO authenticated;
GRANT ALL ON public.customer_prices TO service_role;
ALTER TABLE public.customer_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own customer prices" ON public.customer_prices FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "staff write customer prices" ON public.customer_prices FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ORDERS
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'pending_quote',
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  shipping_fee numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "users read own orders" ON public.orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR customer_id = auth.uid());
CREATE POLICY "users insert own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "staff update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) OR (customer_id = auth.uid() AND status IN ('pending_quote','quoted')));
CREATE POLICY "staff delete orders" ON public.orders FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_code text,
  qty numeric NOT NULL,
  unit text,
  price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items follow order read" ON public.order_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));
CREATE POLICY "items follow order write" ON public.order_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));

-- PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text NOT NULL UNIQUE,
  supplier_name text,
  status public.po_status NOT NULL DEFAULT 'draft',
  total numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "staff only po" ON public.purchase_orders FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  qty numeric NOT NULL,
  cost_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff only po items" ON public.purchase_order_items FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- STOCK MOVEMENTS
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  move_type public.stock_move_type NOT NULL,
  qty numeric NOT NULL,
  ref_type text,
  ref_id uuid,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff only stock" ON public.stock_movements FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- DOCUMENTS
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  doc_type public.doc_type NOT NULL,
  doc_no text NOT NULL,
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own docs" ON public.documents FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));
CREATE POLICY "staff write docs" ON public.documents FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  ref_id uuid,
  read boolean NOT NULL DEFAULT false,
  for_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own notifs" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (for_staff AND public.is_staff(auth.uid())));
CREATE POLICY "users update own notifs" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (for_staff AND public.is_staff(auth.uid())));
CREATE POLICY "auth insert notifs" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "staff delete notifs" ON public.notifications FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

-- ACTIVITY LOGS
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read logs" ON public.activity_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "auth insert logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- SETTINGS (singleton)
CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1,
  store_name text NOT NULL DEFAULT 'ร้านของฉัน',
  logo_url text,
  address text,
  phone text,
  email text,
  line_url text,
  webhook_url text,
  quote_prefix text NOT NULL DEFAULT 'QT',
  order_prefix text NOT NULL DEFAULT 'SO',
  delivery_prefix text NOT NULL DEFAULT 'DN',
  po_prefix text NOT NULL DEFAULT 'PO',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.settings TO authenticated, anon;
GRANT INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "anyone read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "staff write settings" ON public.settings FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.settings (id, store_name) VALUES (1, 'ร้านเครื่องเขียนสายใย') ON CONFLICT DO NOTHING;
