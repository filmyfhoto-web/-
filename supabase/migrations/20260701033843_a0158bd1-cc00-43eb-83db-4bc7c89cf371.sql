
-- 1) organizations.deleted_at
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at ON public.organizations(deleted_at);

-- 2) link_requests table
CREATE TABLE IF NOT EXISTS public.link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name text NOT NULL,
  phone text NOT NULL,
  school_name text NOT NULL,
  matched_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  matched_slug text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  notified_at timestamptz,
  ip inet,
  user_agent text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_requests_created_at ON public.link_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_requests_status ON public.link_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.link_requests TO authenticated;
GRANT ALL ON public.link_requests TO service_role;

ALTER TABLE public.link_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read link_requests" ON public.link_requests;
CREATE POLICY "staff read link_requests" ON public.link_requests
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff update link_requests" ON public.link_requests;
CREATE POLICY "staff update link_requests" ON public.link_requests
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- 3) updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_link_requests_updated_at ON public.link_requests;
CREATE TRIGGER trg_link_requests_updated_at BEFORE UPDATE ON public.link_requests
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 4) Public RPC to submit link request (anon-safe)
CREATE OR REPLACE FUNCTION public.submit_link_request(
  p_contact_name text, p_phone text, p_school_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text := btrim(coalesce(p_contact_name,''));
  v_phone text := btrim(coalesce(p_phone,''));
  v_school text := btrim(coalesce(p_school_name,''));
  v_digits text;
  v_id uuid;
  v_org public.organizations%rowtype;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'invalid contact_name';
  END IF;
  IF length(v_school) < 2 OR length(v_school) > 120 THEN
    RAISE EXCEPTION 'invalid school_name';
  END IF;
  v_digits := regexp_replace(v_phone, '\D', '', 'g');
  IF length(v_digits) < 9 OR length(v_digits) > 12 THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  -- try match existing (ILIKE contains)
  SELECT * INTO v_org FROM public.organizations
   WHERE deleted_at IS NULL AND slug IS NOT NULL
     AND (name ILIKE '%'||v_school||'%' OR v_school ILIKE '%'||name||'%')
   ORDER BY length(name) ASC LIMIT 1;

  INSERT INTO public.link_requests (contact_name, phone, school_name, matched_org_id, matched_slug, status)
  VALUES (v_name, v_phone, v_school, v_org.id, v_org.slug, 'queued')
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_link_request(text,text,text) TO anon, authenticated;

-- 5) Admin RPC: soft-delete org (documents preserved via ON DELETE SET NULL / rds_customers.org_id retained)
CREATE OR REPLACE FUNCTION public.admin_soft_delete_org(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.organizations
     SET deleted_at = now(),
         slug = NULL  -- release slug so it can be reused
   WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_org(uuid) TO authenticated;

-- 6) Admin RPC: update link_request status
CREATE OR REPLACE FUNCTION public.admin_link_request_update_status(
  p_id uuid, p_status text, p_error text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.link_requests
     SET status = coalesce(p_status,status),
         error = p_error,
         admin_note = coalesce(p_note, admin_note),
         notified_at = CASE WHEN p_status = 'sent' THEN now() ELSE notified_at END
   WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_link_request_update_status(uuid,text,text,text) TO authenticated;

-- 7) Update search_org_links to exclude deleted
CREATE OR REPLACE FUNCTION public.search_org_links(q text)
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug
    FROM public.organizations o
   WHERE o.deleted_at IS NULL
     AND o.slug IS NOT NULL
     AND coalesce(length(btrim(q)),0) >= 2
     AND o.name ILIKE '%'||btrim(q)||'%'
   ORDER BY length(o.name) ASC
   LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.search_org_links(text) TO anon, authenticated;

-- 8) Grant service_role select on link_requests (edge functions)
GRANT SELECT ON public.link_requests TO service_role;
