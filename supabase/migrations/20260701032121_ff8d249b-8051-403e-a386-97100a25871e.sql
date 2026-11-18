
CREATE OR REPLACE FUNCTION public.search_org_links(q text)
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug
  FROM public.organizations o
  WHERE coalesce(length(btrim(q)),0) >= 2
    AND o.slug IS NOT NULL
    AND o.name ILIKE '%' || btrim(q) || '%'
  ORDER BY o.name ASC
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.search_org_links(text) TO anon, authenticated;
