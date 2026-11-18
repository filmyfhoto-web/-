-- Customer + staff in-app order notifications with dedup
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_uidx
  ON public.notifications (dedup_key) WHERE dedup_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_app_notification(
  p_user_id uuid,
  p_for_staff boolean,
  p_type text,
  p_title text,
  p_body text,
  p_ref_id uuid,
  p_link text,
  p_dedup_key text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL AND NOT COALESCE(p_for_staff, false) THEN RETURN NULL; END IF;
  INSERT INTO public.notifications(user_id, for_staff, type, title, body, ref_id, link, dedup_key)
  VALUES (p_user_id, COALESCE(p_for_staff,false), p_type,
          left(COALESCE(p_title,''),200), left(COALESCE(p_body,''),500), p_ref_id, p_link, p_dedup_key)
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.enqueue_app_notification(uuid,boolean,text,text,text,uuid,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_app_notification(uuid,boolean,text,text,text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.order_customer_user_id(p_order public.orders)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    p_order.customer_id,
    (SELECT p.id FROM public.profiles p
      WHERE p_order.line_user_id IS NOT NULL AND p.line_user_id = p_order.line_user_id
      LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_orders_notify_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cust uuid;
BEGIN
  v_cust := public.order_customer_user_id(NEW);
  PERFORM public.enqueue_app_notification(
    NULL, true, 'new_order', 'มีออเดอร์ใหม่',
    'ออเดอร์ ' || NEW.order_no || ' ถูกสร้างแล้ว', NEW.id,
    '/admin/orders/' || NEW.id::text, 'order_created_staff:' || NEW.id::text);
  IF v_cust IS NOT NULL THEN
    PERFORM public.enqueue_app_notification(
      v_cust, false, 'order_created', 'รับคำสั่งซื้อแล้ว',
      'เราได้รับคำสั่งซื้อ ' || NEW.order_no || ' เรียบร้อยแล้ว', NEW.id,
      '/my-orders/' || NEW.id::text, 'order_created_cust:' || NEW.id::text);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_orders_notify_created ON public.orders;
CREATE TRIGGER trg_orders_notify_created
AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_notify_created();

CREATE OR REPLACE FUNCTION public.trg_order_status_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders; v_cust uuid; v_label text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_cust := public.order_customer_user_id(v_order);
  v_label := CASE NEW.status
    WHEN 'pending_quote' THEN 'รอเสนอราคา'
    WHEN 'quoted' THEN 'เสนอราคาแล้ว'
    WHEN 'approved' THEN 'อนุมัติแล้ว'
    WHEN 'preparing' THEN 'กำลังจัดเตรียม'
    WHEN 'picking' THEN 'กำลังจัดของ'
    WHEN 'ready' THEN 'พร้อมส่ง/รับ'
    WHEN 'delivered' THEN 'จัดส่งแล้ว'
    WHEN 'completed' THEN 'เสร็จสิ้น'
    WHEN 'cancelled' THEN 'ยกเลิก'
    ELSE NEW.status::text END;
  IF v_cust IS NOT NULL THEN
    PERFORM public.enqueue_app_notification(
      v_cust, false, 'order_status', 'อัปเดตสถานะคำสั่งซื้อ',
      v_order.order_no || ': ' || v_label, v_order.id,
      '/my-orders/' || v_order.id::text,
      'order_status:' || v_order.id::text || ':' || NEW.status);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_order_status_notify ON public.order_status_events;
CREATE TRIGGER trg_order_status_notify
AFTER INSERT ON public.order_status_events FOR EACH ROW EXECUTE FUNCTION public.trg_order_status_notify();