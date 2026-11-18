CREATE OR REPLACE VIEW public.v_unified_customers
WITH (security_invoker = on) AS
  SELECT
    'profile'::text AS source,
    p.id::text      AS source_id,
    COALESCE(p.full_name, p.line_display_name, '')::text AS name,
    p.phone::text   AS phone,
    p.email::text   AS email,
    p.address::text AS address,
    p.line_display_name::text AS line_display_name,
    p.created_at    AS created_at
  FROM public.profiles p
  UNION ALL
  SELECT 'guest'::text, g.id::text, COALESCE(g.name,'')::text, g.phone::text, NULL::text, g.address::text, NULL::text, g.created_at
  FROM public.guest_customers g
  UNION ALL
  SELECT 'film'::text, f.id::text, COALESCE(f.name,'')::text, f.phone::text, NULL::text, f.address::text, NULL::text, f.created_at
  FROM public.film_customers f
  UNION ALL
  SELECT 'rds'::text, r.id::text, COALESCE(r.name,'')::text, r.phone::text, r.email::text, r.address::text, NULL::text, r.created_at
  FROM public.rds_customers r;

GRANT SELECT ON public.v_unified_customers TO authenticated;
GRANT SELECT ON public.v_unified_customers TO service_role;