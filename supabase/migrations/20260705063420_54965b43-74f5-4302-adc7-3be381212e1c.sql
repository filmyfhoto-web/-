-- Prevent non-staff users from setting/changing profiles.organization_id (privilege escalation)
CREATE OR REPLACE FUNCTION public.protect_profile_org_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Staff/admins bypass entirely
  IF public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Users cannot self-assign an organization on insert
    NEW.organization_id := NULL;
    NEW.cost_visible := COALESCE(OLD.cost_visible, false);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Revert privileged columns back to prior values for non-staff
    NEW.organization_id := OLD.organization_id;
    NEW.cost_visible := OLD.cost_visible;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Replace previous update-only trigger with combined insert+update guard
DROP TRIGGER IF EXISTS trg_profiles_protect_privileged ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_protect_org_assignment ON public.profiles;

CREATE TRIGGER trg_profiles_protect_org_assignment
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_org_assignment();