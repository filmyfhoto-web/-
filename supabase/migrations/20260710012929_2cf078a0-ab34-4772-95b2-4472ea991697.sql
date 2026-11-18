
CREATE OR REPLACE FUNCTION public.prevent_self_cost_visible_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_visible IS DISTINCT FROM OLD.cost_visible THEN
    IF NOT public.is_staff(auth.uid()) THEN
      NEW.cost_visible := OLD.cost_visible;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_cost_visible_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_cost_visible_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_cost_visible_escalation();
