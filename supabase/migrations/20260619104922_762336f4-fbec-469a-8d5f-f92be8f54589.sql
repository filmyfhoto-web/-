
CREATE OR REPLACE FUNCTION public.search_organizations(q text)
RETURNS TABLE(id uuid, name text, type text, approved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.type::text, o.approved
  FROM public.organizations o
  WHERE coalesce(length(btrim(q)),0) >= 2
    AND o.name ILIKE '%' || btrim(q) || '%'
  ORDER BY o.approved DESC, o.name ASC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.search_organizations(text) TO anon, authenticated;
