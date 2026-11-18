
-- Admin email allow-list: only listed emails can sign in / hold admin role
CREATE TABLE IF NOT EXISTS public.admin_email_allowlist (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_email_allowlist TO authenticated;
GRANT ALL ON public.admin_email_allowlist TO service_role;

ALTER TABLE public.admin_email_allowlist ENABLE ROW LEVEL SECURITY;

-- Authenticated admins can read the list; nobody writes from client (service_role only)
CREATE POLICY "Admins can view allowlist"
ON public.admin_email_allowlist
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed initial allowed emails (lowercased)
INSERT INTO public.admin_email_allowlist (email, note) VALUES
  ('filmy.fhoto@gmail.com', 'initial owner'),
  ('thanapornkrungsaenmuang@gmail.com', 'initial owner')
ON CONFLICT (email) DO NOTHING;

-- Public helper (SECURITY DEFINER) so anon/authenticated clients can check
-- an email against the list without exposing the whole table.
CREATE OR REPLACE FUNCTION public.is_admin_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_email_allowlist
    WHERE email = lower(coalesce(_email, ''))
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_email(text) TO anon, authenticated;

-- Auto-grant admin role when a user with a verified email is in the allow-list.
CREATE OR REPLACE FUNCTION public.grant_admin_for_allowlisted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND public.is_admin_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_allowlisted();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_allowlisted();

-- Backfill existing users who match the allow-list right now
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
WHERE u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
