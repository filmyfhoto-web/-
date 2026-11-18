-- 1) resolve the existing duplicate LINE binding (keep the verified profile)
ALTER TABLE public.profiles DISABLE TRIGGER trg_guard_profile_line_identity;
UPDATE public.profiles
SET line_user_id = NULL, line_display_name = NULL, line_picture_url = NULL, line_verified_at = NULL
WHERE id = 'd4933d5e-07f2-441c-9a6b-167241bb8fe6'
  AND line_user_id = 'U4f9825c8c6430b03ed959b81ebb9f07e';
ALTER TABLE public.profiles ENABLE TRIGGER trg_guard_profile_line_identity;

-- 2) one LINE identity may map to a single profile only
CREATE UNIQUE INDEX IF NOT EXISTS profiles_line_user_id_unique
  ON public.profiles (line_user_id)
  WHERE line_user_id IS NOT NULL;

-- 3) staff activation flags are admin-only
CREATE OR REPLACE FUNCTION public.guard_profile_staff_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.staff_active      := OLD.staff_active;
  NEW.staff_disabled_at := OLD.staff_disabled_at;
  NEW.staff_disabled_by := OLD.staff_disabled_by;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_profile_staff_active ON public.profiles;
CREATE TRIGGER trg_guard_profile_staff_active
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_staff_active();

CREATE OR REPLACE FUNCTION public.guard_profile_staff_active_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.staff_active      := true;
  NEW.staff_disabled_at := NULL;
  NEW.staff_disabled_by := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_profile_staff_active_ins ON public.profiles;
CREATE TRIGGER trg_guard_profile_staff_active_ins
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_staff_active_ins();