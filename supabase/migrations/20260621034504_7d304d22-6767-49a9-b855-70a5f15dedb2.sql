
-- 1. Expand app_role enum
CREATE TYPE public.app_role_new AS ENUM ('owner','admin','stock_staff','photo_staff','customer');

DROP POLICY IF EXISTS "owners read settings" ON public.settings;
DROP POLICY IF EXISTS "owners write settings" ON public.settings;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role_new USING role::text::public.app_role_new;

DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "owners read settings" ON public.settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE POLICY "owners write settings" ON public.settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));

-- 2. Profiles col first (so can_see_cost compiles)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cost_visible boolean NOT NULL DEFAULT false;

-- 3. Role helpers
CREATE OR REPLACE FUNCTION public.is_staff_any(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin','stock_staff','photo_staff'))
$$;

CREATE OR REPLACE FUNCTION public.can_edit_product(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin','stock_staff'))
$$;

CREATE OR REPLACE FUNCTION public.can_approve(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin'))
$$;

CREATE OR REPLACE FUNCTION public.can_see_cost(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = _uid AND role IN ('owner','admin'))
    OR EXISTS (SELECT 1 FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = _uid AND ur.role = 'stock_staff' AND COALESCE(p.cost_visible,false) = true)
$$;

-- 4. Product enums + columns
CREATE TYPE public.product_status AS ENUM
  ('draft','pending_review','approved','published','unpublished','low_stock','out_of_stock');
CREATE TYPE public.stock_reason AS ENUM
  ('receive_in','sell_out','issue_use','damaged','recount','other');

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status public.product_status NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS storage_location text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_uidx
  ON public.products(barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reason public.stock_reason NOT NULL DEFAULT 'other';

-- 5. products_public view
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public WITH (security_invoker = true) AS
  SELECT id, code, name, category_id, description, unit, image_url,
         standard_price, active, status, created_at, updated_at
  FROM public.products
  WHERE active = true AND status IN ('published','low_stock');
GRANT SELECT ON public.products_public TO anon, authenticated;

-- 6. products RLS
DROP POLICY IF EXISTS "staff write products" ON public.products;
DROP POLICY IF EXISTS "staff read products" ON public.products;
DROP POLICY IF EXISTS "authenticated read active products" ON public.products;

CREATE POLICY "staff_any read products" ON public.products
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()) OR (active = true AND status IN ('published','low_stock')));
CREATE POLICY "editor insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_product(auth.uid()));
CREATE POLICY "editor update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.can_edit_product(auth.uid()))
  WITH CHECK (public.can_edit_product(auth.uid()));
CREATE POLICY "admin delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.can_approve(auth.uid()));

CREATE OR REPLACE FUNCTION public.trg_products_protect_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_admin boolean;
BEGIN
  v_is_admin := public.can_approve(auth.uid());
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    IF NOT v_is_admin THEN
      IF NEW.status NOT IN ('draft','pending_review') THEN
        NEW.status := 'pending_review';
      END IF;
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT v_is_admin THEN
      NEW.standard_price := OLD.standard_price;
      NEW.approved_by    := OLD.approved_by;
      NEW.approved_at    := OLD.approved_at;
      NEW.created_by     := OLD.created_by;
      IF NEW.status NOT IN ('draft','pending_review','unpublished','low_stock','out_of_stock') THEN
        NEW.status := OLD.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_protect_fields ON public.products;
CREATE TRIGGER products_protect_fields
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_protect_fields();

-- 7. product_costs
DROP POLICY IF EXISTS "staff manage product_costs" ON public.product_costs;
CREATE POLICY "admin manage product_costs" ON public.product_costs
  FOR ALL TO authenticated
  USING (public.can_approve(auth.uid()))
  WITH CHECK (public.can_approve(auth.uid()));
CREATE POLICY "cost-visible staff read costs" ON public.product_costs
  FOR SELECT TO authenticated
  USING (public.can_see_cost(auth.uid()));

-- 8. stock_movements
DROP POLICY IF EXISTS "staff only stock" ON public.stock_movements;
CREATE POLICY "editor insert movements" ON public.stock_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_product(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "staff_any read movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));
CREATE POLICY "admin manage movements" ON public.stock_movements
  FOR ALL TO authenticated
  USING (public.can_approve(auth.uid()))
  WITH CHECK (public.can_approve(auth.uid()));

CREATE OR REPLACE FUNCTION public.trg_stock_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.move_type = 'in' THEN v_delta := NEW.qty;
    ELSIF NEW.move_type = 'out' THEN v_delta := -NEW.qty;
    ELSE v_delta := NULL;
    END IF;
    IF v_delta IS NOT NULL THEN
      UPDATE public.products SET stock = COALESCE(stock,0) + v_delta WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET stock = NEW.qty WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stock_apply ON public.stock_movements;
CREATE TRIGGER stock_apply
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_apply();

CREATE OR REPLACE FUNCTION public.trg_products_auto_stock_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('draft','pending_review','unpublished') THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.stock,0) <= 0 THEN
    NEW.status := 'out_of_stock';
  ELSIF COALESCE(NEW.stock,0) <= COALESCE(NEW.low_stock_threshold,0) THEN
    NEW.status := 'low_stock';
  ELSE
    IF NEW.status IN ('low_stock','out_of_stock') THEN
      NEW.status := 'published';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_auto_stock_status ON public.products;
CREATE TRIGGER products_auto_stock_status
  BEFORE UPDATE OF stock, low_stock_threshold ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_products_auto_stock_status();

-- 9. product_images
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_path text,
  uploaded_by uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  is_primary boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_any read images" ON public.product_images
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()) OR status = 'approved');
CREATE POLICY "staff_any insert images" ON public.product_images
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()) AND uploaded_by = auth.uid() AND status = 'pending');
CREATE POLICY "uploader update own pending" ON public.product_images
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() AND status = 'pending')
  WITH CHECK (uploaded_by = auth.uid() AND status = 'pending');
CREATE POLICY "admin manage images" ON public.product_images
  FOR ALL TO authenticated
  USING (public.can_approve(auth.uid()))
  WITH CHECK (public.can_approve(auth.uid()));

CREATE TRIGGER product_images_set_updated BEFORE UPDATE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. product_notes
CREATE TABLE IF NOT EXISTS public.product_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('damaged','restock','bestseller','other')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_notes TO authenticated;
GRANT ALL ON public.product_notes TO service_role;
ALTER TABLE public.product_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_any read notes" ON public.product_notes
  FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));
CREATE POLICY "staff_any insert notes" ON public.product_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "admin manage notes" ON public.product_notes
  FOR ALL TO authenticated
  USING (public.can_approve(auth.uid()))
  WITH CHECK (public.can_approve(auth.uid()));

-- 11. RPCs
CREATE OR REPLACE FUNCTION public.staff_submit_product_image(
  p_product_id uuid, p_url text, p_storage_path text, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.product_images(product_id, url, storage_path, uploaded_by, status, note)
  VALUES (p_product_id, p_url, p_storage_path, auth.uid(), 'pending', p_note)
  RETURNING id INTO v_id;
  INSERT INTO public.notifications(for_staff, type, title, body, ref_id)
  VALUES (true, 'image_pending', 'รูปสินค้ารอตรวจสอบ', 'มีรูปสินค้าใหม่จากพนักงาน', v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_adjust_stock(
  p_product_id uuid, p_move_type text, p_qty numeric, p_reason text, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_edit_product(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_move_type NOT IN ('in','out','adjust') THEN RAISE EXCEPTION 'invalid move_type'; END IF;
  INSERT INTO public.stock_movements(product_id, move_type, qty, reason, note, created_by)
  VALUES (p_product_id, p_move_type::stock_move_type, p_qty, p_reason::stock_reason, p_note, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_product(
  p_product_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_approve THEN
    UPDATE public.products
       SET status='published', approved_by=auth.uid(), approved_at=now()
     WHERE id = p_product_id;
  ELSE
    UPDATE public.products SET status='draft' WHERE id = p_product_id;
  END IF;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), CASE WHEN p_approve THEN 'product_approve' ELSE 'product_reject' END,
          'product', p_product_id, jsonb_build_object('note', p_note));
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_image(
  p_image_id uuid, p_approve boolean, p_set_primary boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid; v_url text;
BEGIN
  IF NOT public.can_approve(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.product_images
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         is_primary = CASE WHEN p_approve AND p_set_primary THEN true ELSE is_primary END
   WHERE id = p_image_id
   RETURNING product_id, url INTO v_pid, v_url;
  IF p_approve AND p_set_primary AND v_pid IS NOT NULL THEN
    UPDATE public.product_images SET is_primary = false
     WHERE product_id = v_pid AND id <> p_image_id;
    UPDATE public.products SET image_url = v_url WHERE id = v_pid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid, p_role text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'owner only'; END IF;
  IF p_role NOT IN ('owner','admin','stock_staff','photo_staff','customer') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, p_role::app_role);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_cost_visible(
  p_user_id uuid, p_visible boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'owner only'; END IF;
  UPDATE public.profiles SET cost_visible = COALESCE(p_visible,false) WHERE id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, full_name text, email text, role text, cost_visible boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.email, ur.role::text, p.cost_visible, p.created_at
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE public.has_role(auth.uid(),'owner')
    AND ur.role IN ('owner','admin','stock_staff','photo_staff')
  ORDER BY ur.role, p.full_name;
$$;

-- 12. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.product_images;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
