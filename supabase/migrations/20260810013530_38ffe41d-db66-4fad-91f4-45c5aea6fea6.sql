ALTER TABLE public.film_ops_notifications
  ADD COLUMN IF NOT EXISTS store_id text,
  ADD COLUMN IF NOT EXISTS group_no smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS film_ops_notifications_group_idx
  ON public.film_ops_notifications (group_no, created_at DESC);

CREATE OR REPLACE FUNCTION public.film_raise_ops_notification(
  p_kind text, p_severity text, p_title text, p_body text,
  p_order_id uuid DEFAULT NULL::uuid, p_job_id uuid DEFAULT NULL::uuid,
  p_dept text DEFAULT NULL::text, p_assignee uuid DEFAULT NULL::uuid,
  p_dedup_key text DEFAULT NULL::text, p_cooldown_minutes integer DEFAULT 60,
  p_store_id text DEFAULT NULL::text, p_group_no smallint DEFAULT 0::smallint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_key text := coalesce(p_dedup_key, p_kind || ':' || coalesce(p_job_id::text, p_order_id::text, 'global')); v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.film_ops_notifications
   WHERE dedup_key = v_key
     AND (created_at > now() - make_interval(mins => p_cooldown_minutes) OR status IN ('new','snoozed'));
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.film_ops_notifications(kind, severity, title, body, order_id, job_id, dept, assignee_user_id, dedup_key, store_id, group_no)
  VALUES (p_kind, p_severity, p_title, p_body, p_order_id, p_job_id, p_dept, p_assignee,
          v_key || ':' || to_char(now(),'YYYYMMDDHH24MI'), p_store_id, coalesce(p_group_no, 0))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.film_notify_web_app_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(NEW.channel, '') NOT IN ('web', 'web_app', 'webapp', 'shop', 'online') THEN
    RETURN NEW;
  END IF;
  PERFORM public.film_raise_ops_notification(
    'web_app_order', 'urgent',
    '🛒 เว็บแอปสั่งซื้อ (' || coalesce(NEW.order_no, '-') || ')',
    'ลูกค้า: ' || coalesce(NEW.customer_name, '-') || ' สั่งซื้อสินค้าเข้ามา',
    NEW.id, NULL, NULL, NULL,
    'web_app_order:' || NEW.id::text, 1440, NULL, 1::smallint
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS film_orders_notify_web_app ON public.film_orders;
CREATE TRIGGER film_orders_notify_web_app
AFTER INSERT ON public.film_orders
FOR EACH ROW EXECUTE FUNCTION public.film_notify_web_app_order();