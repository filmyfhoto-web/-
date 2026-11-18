CREATE TABLE public.shop_service_shortcuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  icon_name text,
  icon_url text,
  target_type text NOT NULL DEFAULT 'search',
  target_value text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_service_shortcuts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_service_shortcuts TO authenticated;
GRANT ALL ON public.shop_service_shortcuts TO service_role;
ALTER TABLE public.shop_service_shortcuts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shortcuts_public_read" ON public.shop_service_shortcuts FOR SELECT USING (true);
CREATE POLICY "shortcuts_staff_write" ON public.shop_service_shortcuts FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER shop_service_shortcuts_touch BEFORE UPDATE ON public.shop_service_shortcuts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.shop_theme_settings (
  id integer PRIMARY KEY DEFAULT 1,
  primary_hsl text NOT NULL DEFAULT '210 49% 20%',
  accent_hsl text NOT NULL DEFAULT '38 55% 60%',
  gradient_strength integer NOT NULL DEFAULT 50,
  icon_size text NOT NULL DEFAULT 'md',
  icon_columns integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_theme_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.shop_theme_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.shop_theme_settings TO authenticated;
GRANT ALL ON public.shop_theme_settings TO service_role;
ALTER TABLE public.shop_theme_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "theme_public_read" ON public.shop_theme_settings FOR SELECT USING (true);
CREATE POLICY "theme_staff_write" ON public.shop_theme_settings FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));
CREATE TRIGGER shop_theme_settings_touch BEFORE UPDATE ON public.shop_theme_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

INSERT INTO public.shop_theme_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO public.shop_service_shortcuts (key, label, icon_name, target_type, target_value, sort_order) VALUES
  ('copy','ถ่ายเอกสาร','Copy','search','ถ่ายเอกสาร',0),
  ('docprint','พิมพ์งาน','Printer','search','พิมพ์งาน',1),
  ('idphoto','รูปติดบัตร','IdCard','search','รูปติดบัตร',2),
  ('vinyl','ป้ายไวนิล','Flag','search','ไวนิล',3),
  ('sticker','สติ๊กเกอร์','Sticker','search','สติ๊กเกอร์',4),
  ('stamp','ตรายาง','Stamp','search','ตรายาง',5),
  ('stationery','เครื่องเขียน','PenLine','search','เครื่องเขียน',6),
  ('binding','เข้าเล่ม','BookOpen','search','เข้าเล่ม',7),
  ('design','ออกแบบ','Palette','search','ออกแบบ',8),
  ('delivery','รับส่งงาน','Truck','search','รับส่ง',9)
ON CONFLICT (key) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_service_shortcuts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_theme_settings;