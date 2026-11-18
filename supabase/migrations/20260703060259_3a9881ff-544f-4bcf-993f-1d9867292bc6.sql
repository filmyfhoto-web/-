
-- 1) inbox_threads
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  line_user_id text PRIMARY KEY,
  last_message_at timestamptz,
  last_message_text text,
  last_event_type text,
  last_replied_at timestamptz,
  replied_by uuid,
  unread_count integer NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  customer_name text,
  customer_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_threads TO authenticated;
GRANT ALL ON public.inbox_threads TO service_role;

ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_inbox_threads"
  ON public.inbox_threads FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_write_inbox_threads"
  ON public.inbox_threads FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_inbox_threads_last_msg ON public.inbox_threads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_unread ON public.inbox_threads (unread_count) WHERE unread_count > 0;

-- Trigger: upsert thread when a customer message arrives via LINE webhook
CREATE OR REPLACE FUNCTION public.trg_inbox_from_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_user_id IS NULL OR NEW.source_user_id = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type NOT IN ('message','postback','follow') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inbox_threads AS t
    (line_user_id, last_message_at, last_message_text, last_event_type, unread_count, updated_at)
  VALUES
    (NEW.source_user_id,
     COALESCE(NEW.received_at, now()),
     LEFT(COALESCE(NEW.message_text, NEW.event_type), 500),
     NEW.event_type,
     CASE WHEN NEW.event_type IN ('message','postback') THEN 1 ELSE 0 END,
     now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET last_message_at = EXCLUDED.last_message_at,
        last_message_text = EXCLUDED.last_message_text,
        last_event_type = EXCLUDED.last_event_type,
        unread_count = t.unread_count + CASE WHEN NEW.event_type IN ('message','postback') THEN 1 ELSE 0 END,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_from_webhook ON public.line_webhook_events;
CREATE TRIGGER trg_inbox_from_webhook
AFTER INSERT ON public.line_webhook_events
FOR EACH ROW EXECUTE FUNCTION public.trg_inbox_from_webhook();

-- Trigger: mark replied when admin sends LINE reply
CREATE OR REPLACE FUNCTION public.trg_inbox_from_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line_user text;
BEGIN
  IF NEW.channel <> 'line' OR NEW.status <> 'sent' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(o.line_user_id, p.line_user_id) INTO v_line_user
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.customer_id
  WHERE o.id = NEW.order_id
  LIMIT 1;

  IF v_line_user IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inbox_threads AS t
    (line_user_id, last_replied_at, replied_by, unread_count, updated_at)
  VALUES
    (v_line_user, now(), NEW.replied_by, 0, now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET last_replied_at = now(),
        replied_by = NEW.replied_by,
        unread_count = 0,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_from_reply ON public.order_replies;
CREATE TRIGGER trg_inbox_from_reply
AFTER INSERT ON public.order_replies
FOR EACH ROW EXECUTE FUNCTION public.trg_inbox_from_reply();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;

-- 2) admin_alert_rules
CREATE TABLE IF NOT EXISTS public.admin_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  label text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view','chat','order','new_customer','high_value_order','keyword')),
  enabled boolean NOT NULL DEFAULT true,
  min_amount numeric,
  keyword text,
  channels text[] NOT NULL DEFAULT ARRAY['line']::text[],
  quiet_hours_start time,
  quiet_hours_end time,
  cooldown_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_alert_rules TO authenticated;
GRANT ALL ON public.admin_alert_rules TO service_role;
ALTER TABLE public.admin_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_admin_read_rules"
  ON public.admin_alert_rules FOR SELECT
  TO authenticated
  USING (admin_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own_or_admin_write_rules"
  ON public.admin_alert_rules FOR ALL
  TO authenticated
  USING (admin_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (admin_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_alert_rules_admin ON public.admin_alert_rules (admin_user_id, enabled);

CREATE TABLE IF NOT EXISTS public.admin_alert_rule_state (
  rule_id uuid PRIMARY KEY REFERENCES public.admin_alert_rules(id) ON DELETE CASCADE,
  last_fired_at timestamptz,
  fire_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_alert_rule_state TO authenticated;
GRANT ALL ON public.admin_alert_rule_state TO service_role;
ALTER TABLE public.admin_alert_rule_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_rule_state"
  ON public.admin_alert_rule_state FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "service_write_rule_state"
  ON public.admin_alert_rule_state FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) quick reply on reply_templates
ALTER TABLE public.reply_templates
  ADD COLUMN IF NOT EXISTS quick_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shortcut text;

CREATE INDEX IF NOT EXISTS idx_reply_templates_quick ON public.reply_templates (quick_reply) WHERE quick_reply = true;

-- Backfill: seed inbox_threads from recent webhook events (last 30d)
INSERT INTO public.inbox_threads (line_user_id, last_message_at, last_message_text, last_event_type, unread_count, updated_at)
SELECT DISTINCT ON (source_user_id)
  source_user_id,
  received_at,
  LEFT(COALESCE(message_text, event_type), 500),
  event_type,
  0,
  now()
FROM public.line_webhook_events
WHERE source_user_id IS NOT NULL
  AND source_user_id <> ''
  AND received_at > now() - interval '30 days'
  AND event_type IN ('message','postback','follow')
ORDER BY source_user_id, received_at DESC
ON CONFLICT (line_user_id) DO NOTHING;

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS touch_alert_rules ON public.admin_alert_rules;
CREATE TRIGGER touch_alert_rules BEFORE UPDATE ON public.admin_alert_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
