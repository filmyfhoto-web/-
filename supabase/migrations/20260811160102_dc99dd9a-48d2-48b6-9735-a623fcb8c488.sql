CREATE TABLE public.line_channel_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.line_notification_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  bound_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bound_at timestamptz NOT NULL DEFAULT now(),
  unbound_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_channel_admins TO authenticated;
GRANT ALL ON public.line_channel_admins TO service_role;

ALTER TABLE public.line_channel_admins ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX line_channel_admins_active_uniq
  ON public.line_channel_admins (channel_id, user_id) WHERE is_active;
CREATE INDEX line_channel_admins_channel_idx ON public.line_channel_admins (channel_id);
CREATE INDEX line_channel_admins_user_idx ON public.line_channel_admins (user_id);

CREATE POLICY "line_channel_admins_read_staff" ON public.line_channel_admins
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'stock_staff'::app_role)
    OR public.has_role(auth.uid(), 'photo_staff'::app_role)
  );

CREATE POLICY "line_channel_admins_write_admin" ON public.line_channel_admins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER line_channel_admins_touch
  BEFORE UPDATE ON public.line_channel_admins
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.line_channel_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.line_notification_channels(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.line_channel_admin_events TO authenticated;
GRANT ALL ON public.line_channel_admin_events TO service_role;

ALTER TABLE public.line_channel_admin_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX line_channel_admin_events_channel_idx
  ON public.line_channel_admin_events (channel_id, created_at DESC);

CREATE POLICY "line_channel_admin_events_read_staff" ON public.line_channel_admin_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'stock_staff'::app_role)
    OR public.has_role(auth.uid(), 'photo_staff'::app_role)
  );

CREATE POLICY "line_channel_admin_events_insert_admin" ON public.line_channel_admin_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));