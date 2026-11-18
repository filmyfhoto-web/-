ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS staff_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_disabled_by uuid;

CREATE OR REPLACE FUNCTION public.staff_is_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT p.staff_active FROM public.profiles p WHERE p.id = _user_id), true)
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND (_role = 'customer'::app_role OR public.staff_is_active(_user_id))
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
     AND public.staff_is_active(_user_id)
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_any(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role IN ('owner','admin','stock_staff','photo_staff')
  ) AND public.staff_is_active(_uid)
$function$;

CREATE OR REPLACE FUNCTION public.has_staff_perm(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.staff_is_active(_user_id) THEN false
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
    ), _module IN ('pos', 'stock', 'po', 'history'))
  END
$function$;

DROP FUNCTION IF EXISTS public.admin_list_staff();
CREATE OR REPLACE FUNCTION public.admin_list_staff()
RETURNS TABLE(user_id uuid, full_name text, email text, role text, cost_visible boolean, created_at timestamptz, staff_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.email, ur.role::text, p.cost_visible, p.created_at, p.staff_active
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE public.has_role(auth.uid(),'owner')
    AND ur.role IN ('owner','admin','stock_staff','photo_staff')
  ORDER BY ur.role, p.full_name;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_staff_active(p_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'owner only'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot disable your own account'; END IF;
  UPDATE public.profiles
     SET staff_active = p_active,
         staff_disabled_at = CASE WHEN p_active THEN NULL ELSE now() END,
         staff_disabled_by = CASE WHEN p_active THEN NULL ELSE auth.uid() END,
         updated_at = now()
   WHERE id = p_user_id;
END $function$;

REVOKE ALL ON FUNCTION public.admin_set_staff_active(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_is_active(uuid) TO authenticated, anon, service_role;