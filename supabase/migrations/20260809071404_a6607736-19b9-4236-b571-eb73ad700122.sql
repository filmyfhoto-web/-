CREATE TABLE IF NOT EXISTS public.line_notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL DEFAULT 'default',
  channel_type text NOT NULL DEFAULT 'admin_group',
  line_destination_id text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  last_test_status text,
  last_test_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS line_notification_channels_dest_uniq
  ON public.line_notification_channels (store_id, channel_type, line_destination_id);
CREATE UNIQUE INDEX IF NOT EXISTS line_notification_channels_one_active
  ON public.line_notification_channels (store_id, channel_type)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS line_notification_channels_active_idx
  ON public.line_notification_channels (channel_type, is_active);

GRANT SELECT ON public.line_notification_channels TO authenticated;
GRANT ALL ON public.line_notification_channels TO service_role;
ALTER TABLE public.line_notification_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read channels" ON public.line_notification_channels
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read active channel status" ON public.line_notification_channels
  FOR SELECT TO authenticated
  USING (is_active AND (public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')));

CREATE TABLE IF NOT EXISTS public.line_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.line_notification_channels(id) ON DELETE SET NULL,
  notification_id uuid,
  kind text NOT NULL DEFAULT 'test',
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  provider_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS line_delivery_logs_idem_uniq
  ON public.line_delivery_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS line_delivery_logs_channel_idx
  ON public.line_delivery_logs (channel_id, created_at DESC);

GRANT SELECT ON public.line_delivery_logs TO authenticated;
GRANT ALL ON public.line_delivery_logs TO service_role;
ALTER TABLE public.line_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read delivery logs" ON public.line_delivery_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff') OR public.has_role(auth.uid(), 'photo_staff')
  );

CREATE TRIGGER line_notification_channels_touch
  BEFORE UPDATE ON public.line_notification_channels
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TRIGGER line_delivery_logs_touch
  BEFORE UPDATE ON public.line_delivery_logs
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();