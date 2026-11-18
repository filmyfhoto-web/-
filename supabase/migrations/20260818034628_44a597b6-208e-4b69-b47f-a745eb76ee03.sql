CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF current_setting('role', true) = 'service_role' OR actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nobody may change their OWN staff status / cost visibility, not even owners
  -- acting on themselves via the self-update policy. Only an owner/admin acting
  -- on someone else's profile may change these privileged fields.
  IF actor <> NEW.id AND (public.has_role(actor, 'owner') OR public.has_role(actor, 'admin')) THEN
    RETURN NEW;
  END IF;

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