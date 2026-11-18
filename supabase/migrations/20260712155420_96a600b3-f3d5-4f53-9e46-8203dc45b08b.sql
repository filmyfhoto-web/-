
CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email','line')),
  target TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','stock_staff','photo_staff')),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  message TEXT,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_invitations_status_idx ON public.admin_invitations(status);
CREATE INDEX IF NOT EXISTS admin_invitations_target_idx ON public.admin_invitations(target);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_invitations TO authenticated;
GRANT ALL ON public.admin_invitations TO service_role;

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_invitations"
  ON public.admin_invitations FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "owner_manage_invitations"
  ON public.admin_invitations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role));

CREATE OR REPLACE FUNCTION public.admin_invitations_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_invitations_touch_trg ON public.admin_invitations;
CREATE TRIGGER admin_invitations_touch_trg
BEFORE UPDATE ON public.admin_invitations
FOR EACH ROW EXECUTE FUNCTION public.admin_invitations_touch();
