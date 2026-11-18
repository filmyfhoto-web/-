CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ref_type text NOT NULL DEFAULT 'order',
  ref_id uuid,
  recipient text,
  binding_id uuid,
  channel text NOT NULL DEFAULT 'line',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider_message_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_outbox_status_chk CHECK (status IN ('pending','processing','sent','failed','dead','skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_idem_uidx ON public.notification_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON public.notification_outbox (status, next_retry_at);
CREATE INDEX IF NOT EXISTS notification_outbox_ref_idx ON public.notification_outbox (ref_type, ref_id, created_at DESC);

GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read outbox" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.notification_outbox_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS notification_outbox_touch_trg ON public.notification_outbox;
CREATE TRIGGER notification_outbox_touch_trg BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.notification_outbox_touch();

-- Enqueue one job; duplicates (same idempotency_key) are ignored.
CREATE OR REPLACE FUNCTION public.notification_outbox_enqueue(
  p_event_type text,
  p_ref_type text,
  p_ref_id uuid,
  p_recipient text,
  p_payload jsonb,
  p_idempotency_key text,
  p_channel text DEFAULT 'line',
  p_binding_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notification_outbox (event_type, ref_type, ref_id, recipient, binding_id, channel, payload, idempotency_key, created_by)
  VALUES (p_event_type, coalesce(p_ref_type,'order'), p_ref_id, p_recipient, p_binding_id, coalesce(p_channel,'line'), coalesce(p_payload,'{}'::jsonb), p_idempotency_key, p_created_by)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.notification_outbox_enqueue(text,text,uuid,text,jsonb,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_outbox_enqueue(text,text,uuid,text,jsonb,text,text,uuid,uuid) TO service_role;

-- Atomically claim due jobs so parallel workers never send the same row twice.
CREATE OR REPLACE FUNCTION public.notification_outbox_claim(p_limit integer DEFAULT 10)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
  SET status = 'processing', attempts = o.attempts + 1, updated_at = now()
  WHERE o.id IN (
    SELECT id FROM public.notification_outbox
    WHERE status IN ('pending','failed') AND next_retry_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit,10), 50))
  )
  RETURNING o.*;
END; $$;

REVOKE ALL ON FUNCTION public.notification_outbox_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_outbox_claim(integer) TO service_role;

-- Close out a claimed job; failures get capped exponential backoff, 5 tries max.
CREATE OR REPLACE FUNCTION public.notification_outbox_complete(
  p_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL,
  p_skipped boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts integer;
BEGIN
  SELECT attempts INTO v_attempts FROM public.notification_outbox WHERE id = p_id;
  IF v_attempts IS NULL THEN RETURN; END IF;
  IF p_skipped THEN
    UPDATE public.notification_outbox
      SET status = 'skipped', last_error = p_error, sent_at = now()
      WHERE id = p_id;
  ELSIF p_ok THEN
    UPDATE public.notification_outbox
      SET status = 'sent', sent_at = now(), last_error = NULL, provider_message_id = p_provider_message_id
      WHERE id = p_id;
  ELSIF v_attempts >= 5 THEN
    UPDATE public.notification_outbox
      SET status = 'dead', last_error = left(coalesce(p_error,'unknown'), 1000)
      WHERE id = p_id;
  ELSE
    UPDATE public.notification_outbox
      SET status = 'failed',
          last_error = left(coalesce(p_error,'unknown'), 1000),
          next_retry_at = now() + make_interval(secs => least(900, power(3, v_attempts)::int * 10))
      WHERE id = p_id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.notification_outbox_complete(uuid,boolean,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_outbox_complete(uuid,boolean,text,text,boolean) TO service_role;