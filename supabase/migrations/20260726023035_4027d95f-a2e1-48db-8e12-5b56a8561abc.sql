CREATE TABLE public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  can_pos boolean NOT NULL DEFAULT true,
  can_stock boolean NOT NULL DEFAULT true,
  can_po boolean NOT NULL DEFAULT false,
  can_history boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read own permissions"
ON public.staff_permissions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER staff_permissions_touch
BEFORE UPDATE ON public.staff_permissions
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.has_staff_perm(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'owner') OR public.has_role(_user_id, 'admin') THEN true
    ELSE COALESCE((
      SELECT CASE _module
        WHEN 'pos' THEN sp.can_pos
        WHEN 'stock' THEN sp.can_stock
        WHEN 'po' THEN sp.can_po
        WHEN 'history' THEN sp.can_history
        ELSE false
      END
      FROM public.staff_permissions sp
      WHERE sp.user_id = _user_id
    ), CASE WHEN _module = 'po' THEN false ELSE true END)
  END
$$;

CREATE OR REPLACE FUNCTION public.owner_set_staff_permissions(
  _user_id uuid,
  _can_pos boolean,
  _can_stock boolean,
  _can_po boolean,
  _can_history boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'only owner can change staff permissions';
  END IF;
  INSERT INTO public.staff_permissions (user_id, can_pos, can_stock, can_po, can_history, updated_by)
  VALUES (_user_id, _can_pos, _can_stock, _can_po, _can_history, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    can_pos = EXCLUDED.can_pos,
    can_stock = EXCLUDED.can_stock,
    can_po = EXCLUDED.can_po,
    can_history = EXCLUDED.can_history,
    updated_by = auth.uid(),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_list_staff_permissions()
RETURNS TABLE (user_id uuid, can_pos boolean, can_stock boolean, can_po boolean, can_history boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.user_id, sp.can_pos, sp.can_stock, sp.can_po, sp.can_history
  FROM public.staff_permissions sp
  WHERE public.has_role(auth.uid(), 'owner')
$$;

REVOKE ALL ON FUNCTION public.owner_set_staff_permissions(uuid, boolean, boolean, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.owner_list_staff_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_set_staff_permissions(uuid, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_list_staff_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staff_perm(uuid, text) TO authenticated;