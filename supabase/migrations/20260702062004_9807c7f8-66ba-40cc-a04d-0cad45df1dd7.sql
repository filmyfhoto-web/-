
-- Add watched flag to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_watched boolean NOT NULL DEFAULT false;

-- Main log table
CREATE TABLE public.product_view_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_code text,
  product_name text,
  path text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id uuid,
  guest_name text,
  guest_phone text,
  line_user_id text,
  ip inet,
  user_agent text,
  device text,
  browser text,
  source text,
  referrer text,
  view_count integer NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_view_logs_session_product_uq
  ON public.product_view_logs(session_id, product_id);
CREATE INDEX product_view_logs_product_last_at_idx
  ON public.product_view_logs(product_id, last_at DESC);
CREATE INDEX product_view_logs_last_at_idx
  ON public.product_view_logs(last_at DESC);
CREATE INDEX product_view_logs_user_idx
  ON public.product_view_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX product_view_logs_phone_idx
  ON public.product_view_logs(guest_phone) WHERE guest_phone IS NOT NULL;
CREATE INDEX product_view_logs_line_idx
  ON public.product_view_logs(line_user_id) WHERE line_user_id IS NOT NULL;

-- Grants: only service_role writes; admins read via SECURITY DEFINER RPCs.
GRANT ALL ON public.product_view_logs TO service_role;

ALTER TABLE public.product_view_logs ENABLE ROW LEVEL SECURITY;

-- Only staff (owner/admin) may read directly; nobody else — no anon/authenticated policies.
CREATE POLICY "staff read product view logs"
  ON public.product_view_logs FOR SELECT
  USING (public.is_staff(auth.uid()));

-- Notify staff when a watched product is viewed (fires once per new session/product row).
CREATE OR REPLACE FUNCTION public.trg_product_view_watch_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_watched boolean;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT is_watched INTO v_watched FROM public.products WHERE id = NEW.product_id;
  IF COALESCE(v_watched,false) = false THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(for_staff, type, title, body, ref_id)
  VALUES (true, 'watched_product_view',
    'สินค้าที่ติดตาม: มีคนดู ' || COALESCE(NEW.product_name,''),
    jsonb_build_object(
      'product_id', NEW.product_id,
      'product_code', NEW.product_code,
      'session_id', NEW.session_id,
      'identified', (NEW.user_id IS NOT NULL OR NEW.guest_phone IS NOT NULL OR NEW.line_user_id IS NOT NULL),
      'at', NEW.first_at
    )::text,
    NEW.product_id);
  RETURN NEW;
END $$;

CREATE TRIGGER product_view_logs_watch_notify
  AFTER INSERT ON public.product_view_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_product_view_watch_notify();

-- Admin listing
CREATE OR REPLACE FUNCTION public.admin_list_product_views(
  p_q text DEFAULT '',
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_identified text DEFAULT 'all',  -- all|identified|anon
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  id uuid, session_id text, product_id uuid, product_code text, product_name text,
  path text, user_id uuid, guest_name text, guest_phone text, line_user_id text,
  full_name text, ip inet, device text, browser text, source text, referrer text,
  view_count int, first_at timestamptz, last_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT v.id, v.session_id, v.product_id, v.product_code, v.product_name,
         v.path, v.user_id, v.guest_name, v.guest_phone, v.line_user_id,
         p.full_name, v.ip, v.device, v.browser, v.source, v.referrer,
         v.view_count, v.first_at, v.last_at
    FROM public.product_view_logs v
    LEFT JOIN public.profiles p ON p.id = v.user_id
   WHERE (p_from IS NULL OR v.last_at >= p_from)
     AND (p_to   IS NULL OR v.last_at <  p_to)
     AND (
       p_identified = 'all'
       OR (p_identified = 'identified'
           AND (v.user_id IS NOT NULL OR v.guest_phone IS NOT NULL OR v.line_user_id IS NOT NULL))
       OR (p_identified = 'anon'
           AND v.user_id IS NULL AND v.guest_phone IS NULL AND v.line_user_id IS NULL)
     )
     AND (
       COALESCE(NULLIF(btrim(p_q),''), '') = ''
       OR v.product_name ILIKE '%'||btrim(p_q)||'%'
       OR v.product_code ILIKE '%'||btrim(p_q)||'%'
       OR COALESCE(v.guest_name,'')  ILIKE '%'||btrim(p_q)||'%'
       OR COALESCE(v.guest_phone,'') ILIKE '%'||btrim(p_q)||'%'
       OR COALESCE(p.full_name,'')   ILIKE '%'||btrim(p_q)||'%'
       OR COALESCE(p.phone,'')       ILIKE '%'||btrim(p_q)||'%'
     )
   ORDER BY v.last_at DESC
   LIMIT GREATEST(p_limit,1) OFFSET GREATEST(p_offset,0);
END $$;

-- Stats
CREATE OR REPLACE FUNCTION public.admin_product_view_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'clicks',   COALESCE(SUM(view_count),0),
    'sessions', COUNT(DISTINCT session_id),
    'identified_sessions',
        COUNT(DISTINCT session_id) FILTER (
          WHERE user_id IS NOT NULL OR guest_phone IS NOT NULL OR line_user_id IS NOT NULL),
    'anon_sessions',
        COUNT(DISTINCT session_id) FILTER (
          WHERE user_id IS NULL AND guest_phone IS NULL AND line_user_id IS NULL),
    'products_viewed', COUNT(DISTINCT product_id)
  ) INTO r
  FROM public.product_view_logs
  WHERE (p_from IS NULL OR last_at >= p_from)
    AND (p_to   IS NULL OR last_at <  p_to);
  RETURN r;
END $$;

-- Per-customer history
CREATE OR REPLACE FUNCTION public.admin_customer_view_history(
  p_user_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_line_user_id text DEFAULT NULL,
  p_limit int DEFAULT 200
) RETURNS TABLE(
  id uuid, product_id uuid, product_code text, product_name text,
  view_count int, first_at timestamptz, last_at timestamptz,
  source text, device text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL AND COALESCE(btrim(p_phone),'') = '' AND COALESCE(btrim(p_line_user_id),'') = '' THEN
    RAISE EXCEPTION 'at least one identifier required';
  END IF;
  RETURN QUERY
  SELECT v.id, v.product_id, v.product_code, v.product_name,
         v.view_count, v.first_at, v.last_at, v.source, v.device
    FROM public.product_view_logs v
   WHERE (p_user_id IS NOT NULL AND v.user_id = p_user_id)
      OR (COALESCE(btrim(p_phone),'') <> '' AND v.guest_phone = btrim(p_phone))
      OR (COALESCE(btrim(p_line_user_id),'') <> '' AND v.line_user_id = btrim(p_line_user_id))
   ORDER BY v.last_at DESC
   LIMIT GREATEST(p_limit,1);
END $$;

-- Retention: cleanup older than 180 days
CREATE OR REPLACE FUNCTION public.cleanup_old_product_views()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.product_view_logs WHERE last_at < now() - interval '180 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
