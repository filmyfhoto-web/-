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
  v_org public.organizations%rowtype;
BEGIN
  IF length(v_school) < 2 OR length(v_school) > 120 THEN
    RAISE EXCEPTION 'invalid school_name';
  END IF;

  SELECT * INTO v_org FROM public.organizations
   WHERE deleted_at IS NULL AND slug IS NOT NULL
     AND (name ILIKE '%'||v_school||'%' OR v_school ILIKE '%'||name||'%')
   ORDER BY length(name) ASC LIMIT 1;

  INSERT INTO public.link_requests (contact_name, phone, school_name, matched_org_id, matched_slug, status)
  VALUES (COALESCE(v_name,'-'), COALESCE(v_phone,'-'), v_school, v_org.id, v_org.slug,
          CASE WHEN v_org.slug IS NOT NULL THEN 'auto_matched' ELSE 'queued' END)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'matched_slug', v_org.slug,
    'matched_name', v_org.name
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.submit_link_request_v2(text,text,text) TO anon, authenticated;