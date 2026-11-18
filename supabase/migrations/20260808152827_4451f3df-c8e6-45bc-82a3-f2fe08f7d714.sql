-- 1) Store metadata
ALTER TABLE public.line_credentials
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.line_credentials
   SET display_name = COALESCE(NULLIF(btrim(display_name), ''), NULLIF(btrim(bot_display_name), ''));

-- 2) Staff-safe store directory (no secrets)
CREATE OR REPLACE FUNCTION public.list_line_stores()
RETURNS TABLE (
  id text,
  display_name text,
  line_basic_id text,
  line_channel_id text,
  is_active boolean,
  has_secret boolean,
  has_token boolean,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         COALESCE(NULLIF(btrim(c.display_name), ''), NULLIF(btrim(c.bot_display_name), ''), c.id),
         NULLIF(btrim(c.bot_basic_id), ''),
         NULLIF(btrim(c.channel_id), ''),
         c.is_active,
         (c.channel_secret IS NOT NULL AND length(c.channel_secret) > 0),
         (c.channel_access_token IS NOT NULL AND length(c.channel_access_token) > 0),
         c.updated_at
    FROM public.line_credentials c
   WHERE public.is_staff_any(auth.uid())
   ORDER BY c.id;
$$;
REVOKE ALL ON FUNCTION public.list_line_stores() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_line_stores() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_line_store_profile(
  p_id text,
  p_display_name text DEFAULT NULL,
  p_basic_id text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_basic_id IS NOT NULL AND btrim(p_basic_id) <> ''
     AND btrim(p_basic_id) !~ '^@[A-Za-z0-9._-]+$' THEN
    RAISE EXCEPTION 'invalid_basic_id';
  END IF;
  INSERT INTO public.line_credentials (id, display_name, bot_basic_id, is_active, updated_at, updated_by)
  VALUES (p_id, NULLIF(btrim(p_display_name), ''), NULLIF(btrim(p_basic_id), ''), COALESCE(p_is_active, true), now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(NULLIF(btrim(p_display_name), ''), public.line_credentials.display_name),
        bot_basic_id = COALESCE(NULLIF(btrim(p_basic_id), ''), public.line_credentials.bot_basic_id),
        is_active = COALESCE(p_is_active, public.line_credentials.is_active),
        updated_at = now(),
        updated_by = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_line_store_profile(text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_line_store_profile(text, text, text, boolean) TO authenticated;

-- 3) Per-store LINE customer profiles
CREATE TABLE IF NOT EXISTS public.line_store_customers (
  store_id text NOT NULL,
  line_user_id text NOT NULL,
  display_name text,
  picture_url text,
  status_message text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, line_user_id)
);
GRANT SELECT ON public.line_store_customers TO authenticated;
GRANT ALL ON public.line_store_customers TO service_role;
ALTER TABLE public.line_store_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read line_store_customers"
  ON public.line_store_customers FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));
CREATE TRIGGER trg_line_store_customers_updated
  BEFORE UPDATE ON public.line_store_customers
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.line_store_customers;

-- 4) Scope inbox threads per store
ALTER TABLE public.inbox_threads ADD COLUMN IF NOT EXISTS store_id text NOT NULL DEFAULT 'default';
ALTER TABLE public.inbox_threads DROP CONSTRAINT IF EXISTS inbox_threads_pkey;
ALTER TABLE public.inbox_threads ADD PRIMARY KEY (store_id, line_user_id);

CREATE OR REPLACE FUNCTION public.trg_inbox_from_webhook()
RETURNS trigger
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
    (store_id, line_user_id, last_message_at, last_message_text, last_event_type, unread_count, updated_at)
  VALUES
    (COALESCE(NULLIF(NEW.channel_id, ''), 'default'),
     NEW.source_user_id,
     COALESCE(NEW.received_at, now()),
     LEFT(COALESCE(NEW.message_text, NEW.event_type), 500),
     NEW.event_type,
     CASE WHEN NEW.event_type IN ('message','postback') THEN 1 ELSE 0 END,
     now())
  ON CONFLICT (store_id, line_user_id) DO UPDATE
    SET last_message_at = EXCLUDED.last_message_at,
        last_message_text = EXCLUDED.last_message_text,
        last_event_type = EXCLUDED.last_event_type,
        unread_count = t.unread_count + CASE WHEN NEW.event_type IN ('message','postback') THEN 1 ELSE 0 END,
        updated_at = now();
  RETURN NEW;
END;
$$;

-- 5) Webhook idempotency
CREATE TABLE IF NOT EXISTS public.line_webhook_dedup (
  webhook_event_id text PRIMARY KEY,
  store_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.line_webhook_dedup TO service_role;
ALTER TABLE public.line_webhook_dedup ENABLE ROW LEVEL SECURITY;