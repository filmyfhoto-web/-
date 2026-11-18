CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Owners/admins (active) may change privileged fields; service_role bypasses RLS/triggers via role check below.
  IF current_setting('role', true) = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-admin users cannot escalate their own privileges.
  NEW.staff_active := OLD.staff_active;
  NEW.staff_disabled_at := OLD.staff_disabled_at;
  NEW.staff_disabled_by := OLD.staff_disabled_by;
  NEW.cost_visible := OLD.cost_visible;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_fields ON public.profiles;
CREATE TRIGGER profiles_guard_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged_fields();