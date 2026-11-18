-- 1) Lease / reclaim + dedup + client_request_id on the outbox
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS deduplicated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_client_req_uidx
  ON public.notification_outbox (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_outbox_lease_idx
  ON public.notification_outbox (status, lease_expires_at);

-- 2) Claim with lease + reclaim of abandoned 'processing' rows
CREATE OR REPLACE FUNCTION public.notification_outbox_claim(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lease integer := greatest(30, least(coalesce(p_lease_seconds,120), 900));
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
  SET status = 'processing',
      attempts = o.attempts + 1,
      claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => v_lease),
      updated_at = now()
  WHERE o.id IN (
    SELECT id FROM public.notification_outbox
    WHERE (
      (status IN ('pending','failed') AND next_retry_at <= now())
      -- reclaim: a worker died mid-flight and its lease expired
      OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < now())
    )
    AND attempts < 8
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit,10), 50))
  )
  RETURNING o.*;
END; $function$;

-- 3) Complete: support provider-side dedup (LINE 409 on the same retry key)
CREATE OR REPLACE FUNCTION public.notification_outbox_complete(
  p_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_skipped boolean DEFAULT false,
  p_permanent boolean DEFAULT false,
  p_deduplicated boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_attempts integer;
BEGIN
  SELECT attempts INTO v_attempts FROM public.notification_outbox WHERE id = p_id;
  IF v_attempts IS NULL THEN RETURN; END IF;

  IF p_skipped THEN
    UPDATE public.notification_outbox
      SET status = 'skipped', last_error = p_error, sent_at = now(),
          lease_expires_at = NULL
      WHERE id = p_id;
  ELSIF p_ok THEN
    UPDATE public.notification_outbox
      SET status = 'sent', sent_at = now(), last_error = NULL,
          provider_message_id = p_provider_message_id,
          deduplicated = p_deduplicated,
          lease_expires_at = NULL
      WHERE id = p_id;
  ELSIF p_permanent OR v_attempts >= 5 THEN
    UPDATE public.notification_outbox
      SET status = 'dead', last_error = left(coalesce(p_error,'unknown'), 1000),
          lease_expires_at = NULL
      WHERE id = p_id;
  ELSE
    UPDATE public.notification_outbox
      SET status = 'failed',
          last_error = left(coalesce(p_error,'unknown'), 1000),
          next_retry_at = now() + make_interval(secs => least(900, power(3, v_attempts)::int * 10)),
          lease_expires_at = NULL
      WHERE id = p_id;
  END IF;
END; $function$;

-- 4) Enqueue: carry a client_request_id (double-click guard) and return the
--    existing row id when the deterministic key was already queued.
CREATE OR REPLACE FUNCTION public.notification_outbox_enqueue(
  p_event_type text,
  p_ref_type text,
  p_ref_id uuid,
  p_recipient text,
  p_payload jsonb,
  p_idempotency_key text,
  p_channel text DEFAULT 'line',
  p_binding_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_client_request_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.notification_outbox
      WHERE client_request_id = p_client_request_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.notification_outbox (
    event_type, ref_type, ref_id, recipient, binding_id, channel,
    payload, idempotency_key, created_by, client_request_id
  )
  VALUES (
    p_event_type, coalesce(p_ref_type,'order'), p_ref_id, p_recipient, p_binding_id,
    coalesce(p_channel,'line'), coalesce(p_payload,'{}'::jsonb), p_idempotency_key,
    p_created_by, p_client_request_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.notification_outbox
      WHERE idempotency_key = p_idempotency_key;
  END IF;
  RETURN v_id;
END; $function$;

-- 5) Dispatcher health log
CREATE TABLE IF NOT EXISTS public.notification_dispatch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'cron',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  claimed integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  dead integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_dispatch_runs TO authenticated;
GRANT ALL ON public.notification_dispatch_runs TO service_role;
ALTER TABLE public.notification_dispatch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read dispatch runs" ON public.notification_dispatch_runs;
CREATE POLICY "staff read dispatch runs"
  ON public.notification_dispatch_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS notification_dispatch_runs_started_idx
  ON public.notification_dispatch_runs (started_at DESC);

-- 6) Manual resend / drain rate limit (server-evaluated)
CREATE OR REPLACE FUNCTION public.notification_manual_rate_ok(
  p_user_id uuid,
  p_max integer DEFAULT 10,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*) < greatest(1, coalesce(p_max,10))
  FROM public.notification_outbox
  WHERE created_by = p_user_id
    AND event_type = 'manual_resend'
    AND created_at > now() - make_interval(secs => greatest(10, coalesce(p_window_seconds,60)));
$function$;

REVOKE ALL ON FUNCTION public.notification_outbox_claim(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_complete(uuid, boolean, text, text, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_outbox_enqueue(text, text, uuid, text, jsonb, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_manual_rate_ok(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_outbox_claim(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_complete(uuid, boolean, text, text, boolean, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_outbox_enqueue(text, text, uuid, text, jsonb, text, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_manual_rate_ok(uuid, integer, integer) TO service_role;