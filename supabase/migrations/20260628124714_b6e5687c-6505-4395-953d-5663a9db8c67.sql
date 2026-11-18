
-- 1) Extend profiles with optional fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS line_display_name text;

-- 2) Extend orders with cancel/soft-delete fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_active ON public.orders (created_at DESC) WHERE deleted_at IS NULL;

-- 3) line_notifications log
CREATE TABLE IF NOT EXISTS public.line_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  order_id uuid,
  document_id uuid,
  type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('to_admin','to_customer')),
  message text,
  sent_status text NOT NULL DEFAULT 'pending' CHECK (sent_status IN ('pending','sent','failed','skipped')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.line_notifications TO authenticated;
GRANT ALL ON public.line_notifications TO service_role;

ALTER TABLE public.line_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read line notifications"
  ON public.line_notifications FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_line_notifications_created ON public.line_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_notifications_order ON public.line_notifications (order_id);

-- 4) admin_cancel_order RPC
CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 2 THEN
    RAISE EXCEPTION 'cancel reason required';
  END IF;
  UPDATE public.orders
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancelled_reason = left(btrim(p_reason), 500),
         deleted_at = COALESCE(deleted_at, now())
   WHERE id = p_id;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'order_cancel', 'order', p_id,
          jsonb_build_object('reason', p_reason));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid, text) TO authenticated;

-- 5) admin_restore_order RPC (undo)
CREATE OR REPLACE FUNCTION public.admin_restore_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.orders
     SET deleted_at = NULL,
         cancelled_at = NULL,
         cancelled_by = NULL,
         cancelled_reason = NULL,
         status = 'pending_quote'
   WHERE id = p_id;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'order_restore', 'order', p_id, '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_restore_order(uuid) TO authenticated;

-- 6) admin_unlink_line for the user themselves (and staff for any user)
CREATE OR REPLACE FUNCTION public.unlink_my_line()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.profiles
     SET line_user_id = NULL, line_display_name = NULL
   WHERE id = auth.uid();
END $$;

GRANT EXECUTE ON FUNCTION public.unlink_my_line() TO authenticated;
