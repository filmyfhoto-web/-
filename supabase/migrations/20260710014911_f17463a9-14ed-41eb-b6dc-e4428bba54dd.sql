
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  actor_user_id uuid,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_audit_created_at ON public.security_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_event_type ON public.security_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_sec_audit_actor ON public.security_audit_log (actor_user_id);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read audit log" ON public.security_audit_log;
CREATE POLICY "staff read audit log"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Only service_role (edge functions + triggers with SECURITY DEFINER) can insert.
DROP POLICY IF EXISTS "no client insert audit log" ON public.security_audit_log;
CREATE POLICY "no client insert audit log"
ON public.security_audit_log
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Update the cost_visible revert trigger to log the attempt
CREATE OR REPLACE FUNCTION public.prevent_self_cost_visible_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cost_visible IS DISTINCT FROM OLD.cost_visible THEN
    IF NOT public.is_staff(auth.uid()) THEN
      INSERT INTO public.security_audit_log (
        event_type, severity, actor_user_id, target_type, target_id, detail
      ) VALUES (
        'cost_visible_revert',
        'warning',
        auth.uid(),
        'profile',
        NEW.id::text,
        jsonb_build_object(
          'attempted_value', NEW.cost_visible,
          'previous_value', OLD.cost_visible
        )
      );
      NEW.cost_visible := OLD.cost_visible;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
