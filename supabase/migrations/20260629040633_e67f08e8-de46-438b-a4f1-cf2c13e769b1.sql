
-- 1) Policy versions table
CREATE TABLE IF NOT EXISTS public.consent_policy_versions (
  key text PRIMARY KEY CHECK (key IN ('terms','privacy')),
  version text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.consent_policy_versions TO anon, authenticated;
GRANT ALL ON public.consent_policy_versions TO service_role;

ALTER TABLE public.consent_policy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_versions_public_read" ON public.consent_policy_versions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "consent_versions_staff_write" ON public.consent_policy_versions
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.consent_policy_versions(key, version) VALUES
  ('terms', '2026-06-29'),
  ('privacy', '2026-06-29')
ON CONFLICT (key) DO NOTHING;

-- 2) Get current versions
CREATE OR REPLACE FUNCTION public.get_current_consent_versions()
RETURNS TABLE(terms text, privacy text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT version FROM public.consent_policy_versions WHERE key='terms'),
    (SELECT version FROM public.consent_policy_versions WHERE key='privacy');
$$;

-- 3) Assert current consent for the calling user
CREATE OR REPLACE FUNCTION public.assert_my_consent_current()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_terms text; v_privacy text;
  v_user_terms text; v_user_privacy text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'consent_required' USING ERRCODE = 'P0001';
  END IF;
  SELECT version INTO v_terms FROM public.consent_policy_versions WHERE key='terms';
  SELECT version INTO v_privacy FROM public.consent_policy_versions WHERE key='privacy';
  SELECT accepted_terms_version, accepted_privacy_version
    INTO v_user_terms, v_user_privacy
    FROM public.profiles WHERE id = v_uid;
  IF v_user_terms IS DISTINCT FROM v_terms OR v_user_privacy IS DISTINCT FROM v_privacy THEN
    RAISE EXCEPTION 'consent_required' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- 4) Trigger on orders to block customer inserts without current consent
CREATE OR REPLACE FUNCTION public.trg_orders_assert_consent()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- only enforce when the caller is the customer creating their own order
  IF auth.uid() IS NOT NULL AND NEW.customer_id = auth.uid()
     AND NOT public.is_staff(auth.uid()) THEN
    PERFORM public.assert_my_consent_current();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_assert_consent ON public.orders;
CREATE TRIGGER trg_orders_assert_consent
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_assert_consent();

-- 5) Download wrapper — returns document + items for the caller, enforcing consent + ownership
CREATE OR REPLACE FUNCTION public.customer_get_document_for_download(p_doc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc jsonb;
  v_items jsonb;
  v_consent jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.assert_my_consent_current();

  -- ownership: documents.order_id -> orders.customer_id = v_uid (or staff)
  IF NOT public.is_staff(v_uid) THEN
    PERFORM 1
      FROM public.documents d
      JOIN public.orders o ON o.id = d.order_id
     WHERE d.id = p_doc_id AND o.customer_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'document not found or not yours';
    END IF;
  END IF;

  SELECT to_jsonb(d) INTO v_doc FROM public.documents d WHERE d.id = p_doc_id;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'document not found'; END IF;

  SELECT jsonb_build_object(
    'terms_version', p.accepted_terms_version,
    'terms_at', p.accepted_terms_at,
    'privacy_version', p.accepted_privacy_version,
    'privacy_at', p.accepted_privacy_at,
    'captured_at', now()
  ) INTO v_consent
  FROM public.profiles p WHERE p.id = v_uid;

  RETURN jsonb_build_object('document', v_doc, 'consent', v_consent);
END;
$$;

-- 6) consent_snapshot column on rds_documents
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS consent_snapshot jsonb;
