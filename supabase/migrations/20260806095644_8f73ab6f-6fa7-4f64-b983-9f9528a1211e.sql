CREATE TABLE IF NOT EXISTS public.shop_feature_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  icon_name text NOT NULL DEFAULT 'Star',
  tone text NOT NULL DEFAULT 'blue',
  auto_source text NOT NULL DEFAULT 'none',
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shop_feature_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.shop_feature_columns(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  image_url text,
  price_text text,
  badge_text text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_feature_items_column_idx ON public.shop_feature_items(column_id, sort_order);

GRANT SELECT ON public.shop_feature_columns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_feature_columns TO authenticated;
GRANT ALL ON public.shop_feature_columns TO service_role;
GRANT SELECT ON public.shop_feature_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_feature_items TO authenticated;
GRANT ALL ON public.shop_feature_items TO service_role;

ALTER TABLE public.shop_feature_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_feature_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_columns_public_read" ON public.shop_feature_columns FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "feature_columns_staff_write" ON public.shop_feature_columns FOR ALL TO authenticated USING (is_staff_any(auth.uid())) WITH CHECK (is_staff_any(auth.uid()));
CREATE POLICY "feature_items_public_read" ON public.shop_feature_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "feature_items_staff_write" ON public.shop_feature_items FOR ALL TO authenticated USING (is_staff_any(auth.uid())) WITH CHECK (is_staff_any(auth.uid()));

CREATE TRIGGER shop_feature_columns_touch BEFORE UPDATE ON public.shop_feature_columns FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER shop_feature_items_touch BEFORE UPDATE ON public.shop_feature_items FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

INSERT INTO public.shop_feature_columns (key, title, subtitle, icon_name, tone, auto_source, sort_order, is_active)
VALUES
  ('popular', 'บริการยอดนิยม', 'ลูกค้าสั่งบ่อยที่สุด', 'Star', 'blue', 'popular', 0, true),
  ('rush', 'งานด่วน', 'รับงานได้ทันที', 'Zap', 'orange', 'rush', 1, true),
  ('foryou', 'แนะนำสำหรับคุณ', 'คัดมาให้โดยเฉพาะ', 'Flame', 'green', 'recommended', 2, true)
ON CONFLICT (key) DO NOTHING;