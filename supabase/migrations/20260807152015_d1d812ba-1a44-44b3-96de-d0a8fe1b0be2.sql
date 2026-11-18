ALTER TABLE public.customer_purchase_orders
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS review_token text,
  ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(6,2) NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wht_rate numeric(6,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS wht_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_total numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS documented_at timestamptz,
  ADD COLUMN IF NOT EXISTS document_no text,
  ADD COLUMN IF NOT EXISTS document_id uuid,
  ADD COLUMN IF NOT EXISTS store_slug text NOT NULL DEFAULT 'printing',
  ADD COLUMN IF NOT EXISTS line_user_id text;

DO $$ BEGIN
  ALTER TABLE public.customer_purchase_orders
    ADD CONSTRAINT cpo_review_status_chk CHECK (review_status IN ('not_sent','awaiting_customer','revision_requested','confirmed','documented'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cpo_review_token_uidx ON public.customer_purchase_orders (review_token) WHERE review_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_po_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.customer_purchase_orders(id) ON DELETE CASCADE,
  event text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_po_review_events TO authenticated;
GRANT ALL ON public.customer_po_review_events TO service_role;
ALTER TABLE public.customer_po_review_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "cpo_events_staff_all" ON public.customer_po_review_events
    FOR ALL TO authenticated
    USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cpo_events_owner_read" ON public.customer_po_review_events
    FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.customer_purchase_orders p
      WHERE p.id = po_id AND p.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS cpo_events_po_idx ON public.customer_po_review_events (po_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.cpo_get_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.customer_purchase_orders;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.customer_purchase_orders WHERE review_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', r.id,
    'po_number', r.po_number,
    'customer_name', r.customer_name,
    'customer_phone', r.customer_phone,
    'school_or_org', r.school_or_org,
    'document_date', r.document_date,
    'items', r.items,
    'note', r.note,
    'subtotal', r.subtotal,
    'discount', r.discount,
    'vat_enabled', r.vat_enabled,
    'vat_rate', r.vat_rate,
    'vat_amount', r.vat_amount,
    'wht_enabled', r.wht_enabled,
    'wht_rate', r.wht_rate,
    'wht_amount', r.wht_amount,
    'net_total', r.net_total,
    'review_status', r.review_status,
    'revision_note', r.revision_note,
    'last_sent_at', r.last_sent_at,
    'confirmed_at', r.confirmed_at,
    'document_no', r.document_no
  );
END $$;

REVOKE ALL ON FUNCTION public.cpo_get_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpo_get_by_token(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cpo_customer_respond(p_token text, p_action text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.customer_purchase_orders; v_status text;
BEGIN
  IF p_action NOT IN ('confirm','revise') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_action');
  END IF;
  SELECT * INTO r FROM public.customer_purchase_orders WHERE review_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF r.review_status = 'documented' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_documented');
  END IF;
  IF r.review_status NOT IN ('awaiting_customer','revision_requested','confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_open');
  END IF;

  v_status := CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'revision_requested' END;

  UPDATE public.customer_purchase_orders SET
    review_status = v_status,
    revision_note = CASE WHEN p_action = 'revise' THEN COALESCE(left(p_note, 1000), '') ELSE '' END,
    confirmed_at = CASE WHEN p_action = 'confirm' THEN now() ELSE NULL END
  WHERE id = r.id;

  INSERT INTO public.customer_po_review_events (po_id, event, note, actor)
  VALUES (r.id, CASE WHEN p_action = 'confirm' THEN 'customer_confirmed' ELSE 'customer_revision' END,
          COALESCE(left(p_note, 1000), ''), 'customer');

  RETURN jsonb_build_object('ok', true, 'review_status', v_status, 'po_number', r.po_number, 'id', r.id);
END $$;

REVOKE ALL ON FUNCTION public.cpo_customer_respond(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cpo_customer_respond(text, text, text) TO anon, authenticated, service_role;