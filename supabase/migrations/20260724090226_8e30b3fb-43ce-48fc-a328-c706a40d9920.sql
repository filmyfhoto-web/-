
-- 1) Table
CREATE TABLE IF NOT EXISTS public.staff_line_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  line_user_id text NOT NULL UNIQUE,
  display_name text,
  picture_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
  requested_role public.app_role,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  revoked_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE ON public.staff_line_bindings TO authenticated;
GRANT ALL ON public.staff_line_bindings TO service_role;

-- 3) RLS
ALTER TABLE public.staff_line_bindings ENABLE ROW LEVEL SECURITY;

-- helper: any staff role
CREATE OR REPLACE FUNCTION public.is_staff_role(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('owner','admin','stock_staff','photo_staff')
  );
$$;

-- owner + admin read all
CREATE POLICY "owner_admin_read_all_slb"
  ON public.staff_line_bindings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

-- staff read their own row
CREATE POLICY "staff_read_own_slb"
  ON public.staff_line_bindings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- owner full write
CREATE POLICY "owner_write_slb"
  ON public.staff_line_bindings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'owner'));

-- No client-side insert/delete; edge function uses service role.

-- 4) Lookup helper for edge function (called with service role, so RLS bypass anyway)
CREATE OR REPLACE FUNCTION public.line_lookup_staff_binding(_line_uid text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  status text,
  display_name text,
  picture_url text,
  has_staff_role boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.user_id, b.status, b.display_name, b.picture_url,
         COALESCE(public.is_staff_role(b.user_id), false) AS has_staff_role
  FROM public.staff_line_bindings b
  WHERE b.line_user_id = _line_uid
  LIMIT 1;
$$;

-- 5) Owner approves + assigns role
CREATE OR REPLACE FUNCTION public.owner_approve_staff_line(
  p_binding uuid,
  p_user_id uuid,
  p_role public.app_role
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  IF p_role NOT IN ('admin','stock_staff','photo_staff') THEN
    RAISE EXCEPTION 'invalid role: %', p_role;
  END IF;

  -- Attach the auth user to the binding (owner may bind a pre-created account).
  UPDATE public.staff_line_bindings
  SET user_id = p_user_id,
      status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      revoked_at = NULL,
      updated_at = now()
  WHERE id = p_binding;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding not found';
  END IF;

  -- Grant role (idempotent via unique(user_id, role))
  INSERT INTO public.user_roles(user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mirror to profiles.line_user_id if empty so future JWT-based edge calls resolve.
  UPDATE public.profiles p
  SET line_user_id = COALESCE(p.line_user_id, b.line_user_id)
  FROM public.staff_line_bindings b
  WHERE b.id = p_binding AND p.id = p_user_id;
END;
$$;

-- 6) Owner revokes
CREATE OR REPLACE FUNCTION public.owner_revoke_staff_line(p_binding uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
BEGIN
  IF NOT public.has_role(v_uid, 'owner') THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  SELECT user_id INTO v_target FROM public.staff_line_bindings WHERE id = p_binding;
  UPDATE public.staff_line_bindings
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE id = p_binding;
  -- Also drop staff roles from the associated user so login stops working
  IF v_target IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_target
      AND role IN ('admin','stock_staff','photo_staff');
  END IF;
END;
$$;

-- 7) updated_at trigger
CREATE OR REPLACE FUNCTION public.slb_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_slb_touch ON public.staff_line_bindings;
CREATE TRIGGER trg_slb_touch BEFORE UPDATE ON public.staff_line_bindings
  FOR EACH ROW EXECUTE FUNCTION public.slb_touch_updated_at();

GRANT EXECUTE ON FUNCTION public.is_staff_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.line_lookup_staff_binding(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.owner_approve_staff_line(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_revoke_staff_line(uuid) TO authenticated;
