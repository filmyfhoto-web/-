
-- Harden the cost-visibility flag: only owner/admin may change it (UPDATE)
CREATE OR REPLACE FUNCTION public.prevent_self_cost_visible_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_visible IS DISTINCT FROM OLD.cost_visible THEN
    IF NOT public.can_approve(auth.uid()) THEN
      INSERT INTO public.security_audit_log (
        event_type, severity, actor_user_id, target_type, target_id, detail
      ) VALUES (
        'cost_visible_revert', 'warning', auth.uid(), 'profile', NEW.id::text,
        jsonb_build_object('attempted_value', NEW.cost_visible, 'previous_value', OLD.cost_visible)
      );
      NEW.cost_visible := OLD.cost_visible;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Close the INSERT path: a self-created profile can never start with cost visibility on
CREATE OR REPLACE FUNCTION public.prevent_cost_visible_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.cost_visible, false) = true AND NOT public.can_approve(auth.uid()) THEN
    INSERT INTO public.security_audit_log (
      event_type, severity, actor_user_id, target_type, target_id, detail
    ) VALUES (
      'cost_visible_revert', 'warning', auth.uid(), 'profile', NEW.id::text,
      jsonb_build_object('attempted_value', true, 'previous_value', null, 'phase', 'insert')
    );
    NEW.cost_visible := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cost_visible_on_insert ON public.profiles;
CREATE TRIGGER trg_prevent_cost_visible_on_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_cost_visible_on_insert();
