CREATE TABLE public.pwa_app_profiles (
  app TEXT PRIMARY KEY CHECK (app IN ('admin','staff','pos')),
  name TEXT,
  short_name TEXT,
  description TEXT,
  theme_color TEXT,
  icon_192_url TEXT,
  icon_512_url TEXT,
  apple_icon_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pwa_app_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pwa_app_profiles TO authenticated;
GRANT ALL ON public.pwa_app_profiles TO service_role;

ALTER TABLE public.pwa_app_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwa_app_profiles_read_all" ON public.pwa_app_profiles
FOR SELECT USING (true);

CREATE POLICY "pwa_app_profiles_write_admin" ON public.pwa_app_profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.set_pwa_app_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_pwa_app_profiles_updated_at
BEFORE UPDATE ON public.pwa_app_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_pwa_app_profiles_updated_at();

CREATE POLICY "pwa_icons_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'pwa-icons');

CREATE POLICY "pwa_icons_admin_write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'pwa-icons' AND (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'pwa-icons' AND (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin')));