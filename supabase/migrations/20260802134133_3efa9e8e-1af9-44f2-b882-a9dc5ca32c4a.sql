CREATE TABLE IF NOT EXISTS public.pos_store_profile (
  store_key text PRIMARY KEY,
  shop_name text NOT NULL DEFAULT '',
  logo_url text,
  address text,
  phone text,
  email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_store_profile TO authenticated;
GRANT ALL ON public.pos_store_profile TO service_role;

ALTER TABLE public.pos_store_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pos_store_profile_read_staff" ON public.pos_store_profile;
CREATE POLICY "pos_store_profile_read_staff" ON public.pos_store_profile
FOR SELECT TO authenticated
USING (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "pos_store_profile_write_admin" ON public.pos_store_profile;
CREATE POLICY "pos_store_profile_write_admin" ON public.pos_store_profile
FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.pos_store_profile (store_key, shop_name)
VALUES ('colorlab', 'นัฐภรณ์ เชียงกลาง'), ('printing', 'นัฐภรณ์ การพิมพ์')
ON CONFLICT (store_key) DO NOTHING;

ALTER TABLE public.pos_store_profile REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_store_profile';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "pos_branding_staff_read" ON storage.objects;
CREATE POLICY "pos_branding_staff_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'pos-branding' AND public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "pos_branding_admin_write" ON storage.objects;
CREATE POLICY "pos_branding_admin_write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'pos-branding' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'pos-branding' AND public.is_staff(auth.uid()));