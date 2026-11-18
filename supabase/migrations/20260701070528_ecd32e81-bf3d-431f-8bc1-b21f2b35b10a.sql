CREATE OR REPLACE FUNCTION public.submit_link_request_v2(p_contact_name text, p_phone text, p_school_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := NULLIF(btrim(coalesce(p_contact_name,'')), '');
  v_phone text := NULLIF(btrim(coalesce(p_phone,'')), '');
  v_school text := btrim(coalesce(p_school_name,''));
  v_id uuid;
  v_candidates jsonb;
  v_match_slug text;
  v_match_name text;
  v_count int;
BEGIN
  IF length(v_school) < 2 OR length(v_school) > 120 THEN
    RAISE EXCEPTION 'invalid school_name';
  END IF;

  WITH cand AS (
    SELECT id, slug, name,
      CASE
        WHEN name ILIKE v_school THEN 0
        WHEN name ILIKE v_school || '%' THEN 1
        WHEN name ILIKE '%' || v_school || '%' THEN 2
        ELSE 3
      END AS rank
    FROM public.organizations
    WHERE deleted_at IS NULL AND slug IS NOT NULL
      AND (name ILIKE '%'||v_school||'%' OR v_school ILIKE '%'||name||'%')
    ORDER BY rank ASC, length(name) ASC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name)), '[]'::jsonb),
         count(*)
    INTO v_candidates, v_count
    FROM cand;

  IF v_count = 1 THEN
    v_match_slug := (v_candidates->0->>'slug');
    v_match_name := (v_candidates->0->>'name');
  END IF;

  INSERT INTO public.link_requests (contact_name, phone, school_name, matched_org_id, matched_slug, status)
  VALUES (
    COALESCE(v_name,'-'), COALESCE(v_phone,'-'), v_school,
    NULLIF((v_candidates->0->>'id'),'')::uuid,
    v_match_slug,
    CASE WHEN v_match_slug IS NOT NULL THEN 'auto_matched' ELSE 'queued' END
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'matched_slug', v_match_slug,
    'matched_name', v_match_name,
    'candidates', v_candidates
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.submit_link_request_v2(text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_link_request(p_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org public.organizations%rowtype;
BEGIN
  SELECT * INTO v_org FROM public.organizations
   WHERE slug = p_slug AND deleted_at IS NULL LIMIT 1;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'invalid slug';
  END IF;
  UPDATE public.link_requests
     SET matched_slug = p_slug,
         matched_org_id = v_org.id,
         status = 'auto_matched'
   WHERE id = p_id AND status IN ('queued','auto_matched');
END; $function$;

GRANT EXECUTE ON FUNCTION public.confirm_link_request(uuid, text) TO anon, authenticated;