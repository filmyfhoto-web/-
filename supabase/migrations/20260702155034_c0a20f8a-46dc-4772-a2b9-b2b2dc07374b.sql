CREATE TABLE IF NOT EXISTS public.line_oa_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  basic_id text,
  default_reply_mode text NOT NULL DEFAULT 'auto',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_oa_settings_mode_chk
    CHECK (default_reply_mode IN ('auto','line_only','copy_only'))
);

GRANT SELECT ON public.line_oa_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.line_oa_settings TO authenticated;
GRANT ALL ON public.line_oa_settings TO service_role;

ALTER TABLE public.line_oa_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "line_oa_settings_read" ON public.line_oa_settings;
CREATE POLICY "line_oa_settings_read" ON public.line_oa_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "line_oa_settings_write" ON public.line_oa_settings;
CREATE POLICY "line_oa_settings_write" ON public.line_oa_settings
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_line_oa_settings_updated_at ON public.line_oa_settings;
CREATE TRIGGER trg_line_oa_settings_updated_at
  BEFORE UPDATE ON public.line_oa_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.line_oa_settings (enabled, default_reply_mode)
SELECT true, 'auto'
WHERE NOT EXISTS (SELECT 1 FROM public.line_oa_settings);