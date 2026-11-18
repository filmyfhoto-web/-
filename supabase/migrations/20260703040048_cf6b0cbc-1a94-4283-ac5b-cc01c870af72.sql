
CREATE TABLE public.admin_line_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id text NOT NULL UNIQUE,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  notify_orders boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_line_recipients_uid_shape
    CHECK (line_user_id ~ '^U[0-9a-f]{32}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_line_recipients TO authenticated;
GRANT ALL ON public.admin_line_recipients TO service_role;

ALTER TABLE public.admin_line_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_line_recipients_read"
  ON public.admin_line_recipients FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'stock_staff')
    OR public.has_role(auth.uid(),'photo_staff')
  );

CREATE POLICY "admin_line_recipients_write"
  ON public.admin_line_recipients FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_admin_line_recipients_updated_at
  BEFORE UPDATE ON public.admin_line_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX admin_line_recipients_enabled_idx
  ON public.admin_line_recipients (enabled, notify_orders)
  WHERE enabled = true AND notify_orders = true;
