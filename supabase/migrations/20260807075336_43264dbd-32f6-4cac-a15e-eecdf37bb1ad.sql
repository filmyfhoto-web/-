-- 1. Hard-enforce that a LINE identity can never be self-assigned by a client.
CREATE OR REPLACE FUNCTION public.guard_film_admin_line_links_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.line_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'line_user_id must be assigned by verified server-side LINE flow';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.line_user_id IS DISTINCT FROM OLD.line_user_id THEN
      RAISE EXCEPTION 'line_user_id must be assigned by verified server-side LINE flow';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_film_admin_line_links_identity ON public.film_admin_line_links;
CREATE TRIGGER guard_film_admin_line_links_identity
BEFORE INSERT OR UPDATE ON public.film_admin_line_links
FOR EACH ROW EXECUTE FUNCTION public.guard_film_admin_line_links_identity();

-- Keep policies fail-closed and explicit about the NULL requirement.
DROP POLICY IF EXISTS "own update admin line links" ON public.film_admin_line_links;
CREATE POLICY "own update admin line links"
ON public.film_admin_line_links
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND line_user_id IS NULL);

-- 2. Align shop_promos write access with the app's staff/owner model.
DROP POLICY IF EXISTS "admin manage promos" ON public.shop_promos;
CREATE POLICY "staff manage promos"
ON public.shop_promos
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));