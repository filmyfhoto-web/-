-- ============================================================
-- 1) Mapping uniqueness must be scoped per MyShop integration
-- ============================================================
DROP INDEX IF EXISTS public.myshop_mapping_remote_uniq;
DROP INDEX IF EXISTS public.myshop_mapping_local_uniq;

CREATE UNIQUE INDEX myshop_mapping_remote_uniq
  ON public.myshop_product_mappings (integration_id, myshop_product_id, COALESCE(myshop_variant_id, ''::text));

CREATE UNIQUE INDEX myshop_mapping_local_uniq
  ON public.myshop_product_mappings (integration_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE product_id IS NOT NULL;

-- ============================================================
-- 2) Durable, coalescing outbox for outbound stock sync
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.myshop_integrations(id) ON DELETE CASCADE,
  mapping_id uuid REFERENCES public.myshop_product_mappings(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid,
  target_stock numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_sync_outbox_status_chk
    CHECK (status IN ('pending','processing','succeeded','failed','skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_sync_outbox_key_uniq
  ON public.stock_sync_outbox (integration_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS stock_sync_outbox_due_idx
  ON public.stock_sync_outbox (status, next_retry_at);

GRANT SELECT ON public.stock_sync_outbox TO authenticated;
GRANT ALL ON public.stock_sync_outbox TO service_role;
ALTER TABLE public.stock_sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read stock sync outbox" ON public.stock_sync_outbox;
CREATE POLICY "staff read stock sync outbox" ON public.stock_sync_outbox
  FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

CREATE TABLE IF NOT EXISTS public.stock_sync_worker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  error text
);

GRANT SELECT ON public.stock_sync_worker_runs TO authenticated;
GRANT ALL ON public.stock_sync_worker_runs TO service_role;
ALTER TABLE public.stock_sync_worker_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read stock sync runs" ON public.stock_sync_worker_runs;
CREATE POLICY "staff read stock sync runs" ON public.stock_sync_worker_runs
  FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

-- ============================================================
-- 3) Enqueue helper: absolute target stock, coalesced per key
-- ============================================================
CREATE OR REPLACE FUNCTION public.stock_sync_enqueue(p_product_id uuid, p_variant_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric;
  v_n integer := 0;
  m record;
  l record;
  v_wrapper_stock numeric;
BEGIN
  IF p_product_id IS NULL THEN RETURN 0; END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT COALESCE(stock, 0) INTO v_stock FROM public.product_variants WHERE id = p_variant_id;
  ELSE
    SELECT COALESCE(stock, 0) INTO v_stock FROM public.products WHERE id = p_product_id;
  END IF;
  v_stock := GREATEST(COALESCE(v_stock, 0), 0);

  FOR m IN
    SELECT mp.id, mp.integration_id, mp.product_id, mp.variant_id
    FROM public.myshop_product_mappings mp
    JOIN public.myshop_integrations i ON i.id = mp.integration_id
    WHERE mp.product_id = p_product_id
      AND COALESCE(mp.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND i.enabled = true
      AND i.sync_inventory = true
  LOOP
    INSERT INTO public.stock_sync_outbox (integration_id, mapping_id, product_id, variant_id, target_stock, status, next_retry_at, updated_at)
    VALUES (m.integration_id, m.id, m.product_id, m.variant_id, v_stock, 'pending', now(), now())
    ON CONFLICT (integration_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET
      target_stock = EXCLUDED.target_stock,
      mapping_id = EXCLUDED.mapping_id,
      status = 'pending',
      attempts = 0,
      next_retry_at = now(),
      last_error = NULL,
      updated_at = now();
    v_n := v_n + 1;
  END LOOP;

  -- Wrapper products have no stock of their own: their sellable quantity is
  -- derived from the base product, so a base movement must refresh them too.
  IF p_variant_id IS NULL THEN
    FOR l IN
      SELECT wrapper_id, ratio FROM public.product_unit_links
      WHERE base_id = p_product_id AND enabled = true AND COALESCE(ratio, 0) > 0
    LOOP
      v_wrapper_stock := floor(v_stock / l.ratio);
      FOR m IN
        SELECT mp.id, mp.integration_id, mp.product_id
        FROM public.myshop_product_mappings mp
        JOIN public.myshop_integrations i ON i.id = mp.integration_id
        WHERE mp.product_id = l.wrapper_id
          AND mp.variant_id IS NULL
          AND i.enabled = true
          AND i.sync_inventory = true
      LOOP
        INSERT INTO public.stock_sync_outbox (integration_id, mapping_id, product_id, variant_id, target_stock, status, next_retry_at, updated_at)
        VALUES (m.integration_id, m.id, m.product_id, NULL, GREATEST(v_wrapper_stock, 0), 'pending', now(), now())
        ON CONFLICT (integration_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          target_stock = EXCLUDED.target_stock,
          mapping_id = EXCLUDED.mapping_id,
          status = 'pending',
          attempts = 0,
          next_retry_at = now(),
          last_error = NULL,
          updated_at = now();
        v_n := v_n + 1;
      END LOOP;
    END LOOP;
  END IF;

  RETURN v_n;
END $function$;

-- Every stock movement (the single mutation path) refreshes the outbox.
CREATE OR REPLACE FUNCTION public.trg_stock_sync_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.stock_sync_enqueue(NEW.product_id, NEW.variant_id);
  EXCEPTION WHEN OTHERS THEN
    -- never block a local stock movement because of outbound sync bookkeeping
    RAISE WARNING 'stock_sync_enqueue failed: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS stock_sync_enqueue_after_move ON public.stock_movements;
CREATE TRIGGER stock_sync_enqueue_after_move
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_sync_enqueue();

-- ============================================================
-- 4) Worker-facing RPCs (service role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.myshop_stock_claim(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  integration_id uuid,
  channel_id text,
  mapping_id uuid,
  myshop_product_id text,
  myshop_variant_id text,
  product_id uuid,
  variant_id uuid,
  target_stock numeric,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT o.id
    FROM public.stock_sync_outbox o
    JOIN public.myshop_integrations i ON i.id = o.integration_id
    WHERE o.status IN ('pending','failed')
      AND o.next_retry_at <= now()
      AND i.enabled = true
      AND i.sync_inventory = true
    ORDER BY o.next_retry_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (
    UPDATE public.stock_sync_outbox o
       SET status = 'processing', attempts = o.attempts + 1, updated_at = now()
     WHERE o.id IN (SELECT id FROM due)
    RETURNING o.*
  )
  SELECT c.id, c.integration_id, i.channel_id, c.mapping_id,
         mp.myshop_product_id, mp.myshop_variant_id,
         c.product_id, c.variant_id, c.target_stock, c.attempts
  FROM claimed c
  JOIN public.myshop_integrations i ON i.id = c.integration_id
  LEFT JOIN public.myshop_product_mappings mp ON mp.id = c.mapping_id;
END $function$;

CREATE OR REPLACE FUNCTION public.myshop_stock_complete(p_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_attempts integer;
BEGIN
  IF p_status NOT IN ('succeeded','failed','skipped') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023';
  END IF;
  SELECT attempts INTO v_attempts FROM public.stock_sync_outbox WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_status = 'succeeded' THEN
    UPDATE public.stock_sync_outbox
       SET status='succeeded', last_error=NULL, last_synced_at=now(), updated_at=now()
     WHERE id = p_id;
    UPDATE public.myshop_product_mappings mp
       SET last_stock_synced_at = now(), last_error = NULL, sync_status = 'synced', updated_at = now()
      FROM public.stock_sync_outbox o
     WHERE o.id = p_id AND mp.id = o.mapping_id;
  ELSIF p_status = 'skipped' THEN
    UPDATE public.stock_sync_outbox
       SET status='skipped', last_error=p_error, updated_at=now()
     WHERE id = p_id;
    UPDATE public.myshop_product_mappings mp
       SET last_error = p_error, sync_status = 'needs_variant', updated_at = now()
      FROM public.stock_sync_outbox o
     WHERE o.id = p_id AND mp.id = o.mapping_id;
  ELSE
    UPDATE public.stock_sync_outbox
       SET status='failed',
           last_error=p_error,
           next_retry_at = now() + (LEAST(GREATEST(COALESCE(v_attempts,1),1), 8) * interval '2 minutes'),
           updated_at=now()
     WHERE id = p_id;
    UPDATE public.myshop_product_mappings mp
       SET last_error = p_error, sync_status = 'error', updated_at = now()
      FROM public.stock_sync_outbox o
     WHERE o.id = p_id AND mp.id = o.mapping_id;
  END IF;
END $function$;

-- ============================================================
-- 5) Admin-facing RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.myshop_stock_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb; r record;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'processing', COUNT(*) FILTER (WHERE status = 'processing'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
    'synced', COUNT(*) FILTER (WHERE status = 'succeeded'),
    'total', COUNT(*),
    'last_success', MAX(last_synced_at)
  ) INTO v FROM public.stock_sync_outbox;

  SELECT * INTO r FROM public.stock_sync_worker_runs ORDER BY started_at DESC LIMIT 1;
  RETURN COALESCE(v, '{}'::jsonb) || jsonb_build_object(
    'last_run_at', r.started_at,
    'last_run_finished_at', r.finished_at,
    'last_run_processed', r.processed,
    'last_run_failed', r.failed,
    'last_run_error', r.error
  );
END $function$;

CREATE OR REPLACE FUNCTION public.myshop_stock_enqueue_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE m record; v_n integer := 0;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  FOR m IN
    SELECT DISTINCT mp.product_id, mp.variant_id
    FROM public.myshop_product_mappings mp
    JOIN public.myshop_integrations i ON i.id = mp.integration_id
    WHERE mp.product_id IS NOT NULL AND i.enabled = true AND i.sync_inventory = true
  LOOP
    v_n := v_n + public.stock_sync_enqueue(m.product_id, m.variant_id);
  END LOOP;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.myshop_stock_retry_failed()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n integer;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.stock_sync_outbox
     SET status='pending', attempts=0, next_retry_at=now(), last_error=NULL, updated_at=now()
   WHERE status IN ('failed','skipped','processing');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.myshop_stock_problems(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  status text,
  attempts integer,
  target_stock numeric,
  last_error text,
  updated_at timestamptz,
  product_name text,
  product_code text,
  channel_id text,
  myshop_product_id text,
  myshop_variant_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT o.id, o.status, o.attempts, o.target_stock, o.last_error, o.updated_at,
         p.name, p.code, i.channel_id, mp.myshop_product_id, mp.myshop_variant_id
  FROM public.stock_sync_outbox o
  JOIN public.myshop_integrations i ON i.id = o.integration_id
  LEFT JOIN public.products p ON p.id = o.product_id
  LEFT JOIN public.myshop_product_mappings mp ON mp.id = o.mapping_id
  WHERE o.status IN ('failed','skipped')
    AND public.is_staff_any(auth.uid())
  ORDER BY o.updated_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$function$;

REVOKE ALL ON FUNCTION public.stock_sync_enqueue(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.myshop_stock_claim(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.myshop_stock_complete(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_stock_claim(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.myshop_stock_complete(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stock_sync_enqueue(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.myshop_stock_sync_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.myshop_stock_enqueue_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.myshop_stock_retry_failed() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.myshop_stock_problems(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.myshop_stock_sync_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.myshop_stock_enqueue_all() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.myshop_stock_retry_failed() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.myshop_stock_problems(integer) TO authenticated, service_role;