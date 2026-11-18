CREATE OR REPLACE FUNCTION public.guard_profile_line_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (edge functions performing verified LINE binding) bypasses.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.line_user_id IS DISTINCT FROM OLD.line_user_id
     OR NEW.line_verified_at IS DISTINCT FROM OLD.line_verified_at
     OR NEW.line_display_name IS DISTINCT FROM OLD.line_display_name
     OR NEW.line_picture_url IS DISTINCT FROM OLD.line_picture_url THEN
    RAISE EXCEPTION 'LINE identity fields can only be set by verified server-side linking';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_line_identity ON public.profiles;
CREATE TRIGGER trg_guard_profile_line_identity
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_line_identity();

CREATE OR REPLACE FUNCTION public.guard_profile_line_identity_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.line_user_id IS NOT NULL OR NEW.line_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'LINE identity fields can only be set by verified server-side linking';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_line_identity_ins ON public.profiles;
CREATE TRIGGER trg_guard_profile_line_identity_ins
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_line_identity_ins();