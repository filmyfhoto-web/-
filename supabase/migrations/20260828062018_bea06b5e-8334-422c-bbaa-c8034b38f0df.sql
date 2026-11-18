CREATE TABLE IF NOT EXISTS public.site_settings_internal (
  id integer PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings_internal TO authenticated;
GRANT ALL ON public.site_settings_internal TO service_role;

ALTER TABLE public.site_settings_internal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings_internal_admin_read" ON public.site_settings_internal
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "site_settings_internal_admin_write" ON public.site_settings_internal
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.site_settings_internal (id, config, updated_at, updated_by)
SELECT s.id, s.internal_config, s.updated_at, s.updated_by
FROM public.site_settings s
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings DROP COLUMN IF EXISTS internal_config;

COMMENT ON TABLE public.site_settings_internal IS 'Owner/admin-only settings. Kept out of the publicly readable site_settings row.';