
ALTER TABLE public.order_replies
  ADD COLUMN IF NOT EXISTS template_type text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS line_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE OR REPLACE FUNCTION public.order_has_line_user(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line text;
  v_cust uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT line_user_id, customer_id INTO v_line, v_cust
    FROM public.orders WHERE id = p_order_id;
  IF v_line IS NOT NULL AND length(v_line) > 0 THEN RETURN true; END IF;
  IF v_cust IS NOT NULL THEN
    SELECT line_user_id INTO v_line FROM public.profiles WHERE id = v_cust;
    RETURN v_line IS NOT NULL AND length(v_line) > 0;
  END IF;
  RETURN false;
END $$;
