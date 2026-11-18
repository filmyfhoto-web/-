-- ============ A) QUEUE AUTOMATION ============

-- 1. Routing settings (admin editable, no hard-coded mapping)
CREATE TABLE public.film_queue_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  label text NOT NULL,
  dept text NOT NULL,
  sla_hours numeric NOT NULL DEFAULT 24,
  outsource_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.film_queue_routing TO authenticated;
GRANT ALL ON public.film_queue_routing TO service_role;
ALTER TABLE public.film_queue_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routing readable by staff" ON public.film_queue_routing
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "routing managed by admins" ON public.film_queue_routing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.film_queue_routing TO authenticated;

INSERT INTO public.film_queue_routing (category,label,dept,sla_hours,outsource_default) VALUES
  ('stationery','เครื่องเขียน','front',4,false),
  ('photo','อัดรูป','photo',6,false),
  ('copy','ถ่ายเอกสาร','doc',4,false),
  ('print','งานพิมพ์','print',24,false),
  ('sticker','สติ๊กเกอร์','print',24,false),
  ('sign','ป้าย','production',48,true),
  ('cnc','งาน CNC','production',72,true),
  ('other','อื่น ๆ','front',24,false)
ON CONFLICT (category) DO NOTHING;

-- 2. Capacity per department
CREATE TABLE public.film_dept_capacity (
  dept text PRIMARY KEY,
  label text NOT NULL,
  daily_minutes integer NOT NULL DEFAULT 480,
  daily_jobs integer NOT NULL DEFAULT 30,
  backup_employee_id uuid REFERENCES public.film_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.film_dept_capacity TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.film_dept_capacity TO authenticated;
GRANT ALL ON public.film_dept_capacity TO service_role;
ALTER TABLE public.film_dept_capacity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capacity readable by staff" ON public.film_dept_capacity
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "capacity managed by admins" ON public.film_dept_capacity
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

INSERT INTO public.film_dept_capacity (dept,label) VALUES
  ('front','หน้าร้าน'),('photo','ฝ่ายรูป'),('doc','ฝ่ายเอกสาร'),
  ('print','ฝ่ายพิมพ์'),('production','ฝ่ายผลิต'),('outsource','ร้านใหญ่')
ON CONFLICT (dept) DO NOTHING;

-- 3. Queue settings extras
ALTER TABLE public.film_queue_settings
  ADD COLUMN IF NOT EXISTS auto_assign boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_deposit_before_production boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warn_before_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS stale_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS escalate_after_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS outsource_late_hours integer NOT NULL DEFAULT 24;

-- 4. Job columns for queueing
ALTER TABLE public.film_order_jobs
  ADD COLUMN IF NOT EXISTS queue_code text,
  ADD COLUMN IF NOT EXISTS priority_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS qc_status text,
  ADD COLUMN IF NOT EXISTS requeue_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS film_order_jobs_queue_code_key ON public.film_order_jobs(queue_code) WHERE queue_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS film_order_jobs_order_item_key ON public.film_order_jobs(order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS film_order_jobs_status_dept_idx ON public.film_order_jobs(status, dept);
CREATE INDEX IF NOT EXISTS film_order_jobs_priority_idx ON public.film_order_jobs(priority_score DESC);

-- 5. Per-scope/day counters
CREATE TABLE public.film_queue_counters (
  scope text NOT NULL,
  day date NOT NULL,
  seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, day)
);
GRANT SELECT ON public.film_queue_counters TO authenticated;
GRANT ALL ON public.film_queue_counters TO service_role;
ALTER TABLE public.film_queue_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters readable by staff" ON public.film_queue_counters
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 6. Automation runs (diagnostics)
CREATE TABLE public.film_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref_id uuid,
  idempotency_key text UNIQUE,
  status text NOT NULL DEFAULT 'ok',
  attempts integer NOT NULL DEFAULT 1,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.film_automation_runs TO authenticated;
GRANT ALL ON public.film_automation_runs TO service_role;
ALTER TABLE public.film_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation runs for admins" ON public.film_automation_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS film_automation_runs_created_idx ON public.film_automation_runs(created_at DESC);

-- ============ B) CONTROL ROOM NOTIFICATIONS ============
CREATE TABLE public.film_ops_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  order_id uuid REFERENCES public.film_orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.film_order_jobs(id) ON DELETE CASCADE,
  dept text,
  assignee_user_id uuid,
  dedup_key text UNIQUE,
  status text NOT NULL DEFAULT 'new',
  read_at timestamptz,
  snooze_until timestamptz,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  escalated_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.film_ops_notifications TO authenticated;
GRANT ALL ON public.film_ops_notifications TO service_role;
ALTER TABLE public.film_ops_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops notif admins manage" ON public.film_ops_notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ops notif staff read own" ON public.film_ops_notifications
  FOR SELECT TO authenticated
  USING (assignee_user_id = auth.uid());
CREATE POLICY "ops notif staff ack own" ON public.film_ops_notifications
  FOR UPDATE TO authenticated
  USING (assignee_user_id = auth.uid())
  WITH CHECK (assignee_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS film_ops_notifications_status_idx ON public.film_ops_notifications(status, severity, created_at DESC);

CREATE TABLE public.film_notification_prefs (
  user_id uuid PRIMARY KEY,
  kinds jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels jsonb NOT NULL DEFAULT '{"in_app": true, "line": false}'::jsonb,
  quiet_start time,
  quiet_end time,
  sound_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.film_notification_prefs TO authenticated;
GRANT ALL ON public.film_notification_prefs TO service_role;
ALTER TABLE public.film_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notification prefs" ON public.film_notification_prefs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.film_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER film_queue_routing_touch BEFORE UPDATE ON public.film_queue_routing
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();
CREATE TRIGGER film_dept_capacity_touch BEFORE UPDATE ON public.film_dept_capacity
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();
CREATE TRIGGER film_ops_notifications_touch BEFORE UPDATE ON public.film_ops_notifications
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();
CREATE TRIGGER film_notification_prefs_touch BEFORE UPDATE ON public.film_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();

-- queue code: PHOTO-260809-001
CREATE OR REPLACE FUNCTION public.film_next_queue_code(p_dept text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day date := (now() AT TIME ZONE 'Asia/Bangkok')::date; v_seq int; v_scope text := upper(coalesce(p_dept,'GEN'));
BEGIN
  INSERT INTO public.film_queue_counters(scope, day, seq) VALUES (v_scope, v_day, 1)
  ON CONFLICT (scope, day) DO UPDATE SET seq = public.film_queue_counters.seq + 1
  RETURNING seq INTO v_seq;
  RETURN v_scope || '-' || to_char(v_day,'YYMMDD') || '-' || lpad(v_seq::text,3,'0');
END; $$;

-- predictable priority score + human readable reason
CREATE OR REPLACE FUNCTION public.film_priority_score(
  p_urgent boolean, p_due timestamptz, p_created timestamptz, p_blocked boolean DEFAULT false,
  OUT score numeric, OUT reason text)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_hours numeric; v_parts text[] := '{}';
BEGIN
  score := 0;
  IF coalesce(p_urgent,false) THEN score := score + 1000; v_parts := v_parts || 'งานด่วน +1000'; END IF;
  IF p_due IS NOT NULL THEN
    v_hours := EXTRACT(EPOCH FROM (p_due - now()))/3600;
    score := score + GREATEST(0, 500 - v_hours * 5);
    v_parts := v_parts || ('ใกล้กำหนดส่ง +' || round(GREATEST(0, 500 - v_hours*5))::text);
  END IF;
  score := score + LEAST(200, GREATEST(0, EXTRACT(EPOCH FROM (now() - coalesce(p_created, now())))/3600));
  v_parts := v_parts || ('รอคิวมานาน +' || round(LEAST(200, GREATEST(0, EXTRACT(EPOCH FROM (now() - coalesce(p_created, now())))/3600)))::text);
  IF coalesce(p_blocked,false) THEN score := score - 300; v_parts := v_parts || 'ติด dependency -300'; END IF;
  reason := array_to_string(v_parts, ' · ');
END; $$;

-- idempotent job creation when an order is confirmed
CREATE OR REPLACE FUNCTION public.film_confirm_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := 'confirm_order:' || p_order_id::text;
  v_order public.film_orders%ROWTYPE;
  v_item record; v_route record; v_dept text; v_created int := 0; v_skipped int := 0;
  v_score numeric; v_reason text; v_due timestamptz;
BEGIN
  IF NOT (public.is_staff(auth.uid()) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO v_order FROM public.film_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  INSERT INTO public.film_automation_runs(kind, ref_id, idempotency_key, status)
  VALUES ('confirm_order', p_order_id, v_key, 'running')
  ON CONFLICT (idempotency_key) DO UPDATE SET attempts = public.film_automation_runs.attempts + 1;

  FOR v_item IN SELECT * FROM public.film_order_items WHERE order_id = p_order_id ORDER BY sort_order NULLS LAST, created_at LOOP
    IF EXISTS (SELECT 1 FROM public.film_order_jobs WHERE order_item_id = v_item.id) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    SELECT * INTO v_route FROM public.film_queue_routing WHERE category = coalesce(v_item.category,'other') AND active;
    v_dept := coalesce(v_item.dept, v_route.dept, 'front');
    IF coalesce(v_item.is_outsourced, v_route.outsource_default, false) THEN v_dept := 'outsource'; END IF;
    v_due := coalesce(v_item.due_at, v_order.due_at, now() + make_interval(hours => coalesce(v_route.sla_hours, 24)::int));
    SELECT s.score, s.reason INTO v_score, v_reason
      FROM public.film_priority_score(v_order.is_urgent, v_due, now()) s;

    INSERT INTO public.film_order_jobs(
      order_id, order_item_id, title, status, category, dept, size, unit, quantity,
      cost_price, due_at, is_outsourced, attachments, notes, assigned_employee_id,
      queue_code, priority_score, priority_reason, sort_order)
    VALUES (
      p_order_id, v_item.id, coalesce(v_item.title, v_item.description, 'งาน'),
      CASE WHEN coalesce(v_item.is_outsourced, v_route.outsource_default, false) THEN 'waiting_outsource' ELSE 'new' END,
      coalesce(v_item.category,'other'), v_dept, v_item.size, v_item.unit, coalesce(v_item.quantity,1),
      coalesce(v_item.cost_price,0), v_due, coalesce(v_item.is_outsourced, v_route.outsource_default, false),
      coalesce(v_item.attachments,'[]'::jsonb), v_item.notes, v_item.assigned_employee_id,
      public.film_next_queue_code(v_dept), v_score, v_reason, coalesce(v_item.sort_order, 0));
    v_created := v_created + 1;
  END LOOP;

  UPDATE public.film_orders SET is_draft = false,
    status = CASE WHEN status IN ('draft','') OR status IS NULL THEN 'confirmed' ELSE status END,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.film_order_events(order_id, action, to_status, note, created_by)
  VALUES (p_order_id, 'confirm', 'confirmed', format('สร้างงานย่อย %s รายการ (ข้ามซ้ำ %s)', v_created, v_skipped), auth.uid());

  UPDATE public.film_automation_runs
    SET status = 'ok', finished_at = now(),
        result = jsonb_build_object('created', v_created, 'skipped', v_skipped)
  WHERE idempotency_key = v_key;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped);
END; $$;
REVOKE ALL ON FUNCTION public.film_confirm_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.film_confirm_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.film_next_queue_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.film_priority_score(boolean, timestamptz, timestamptz, boolean) TO authenticated, service_role;

-- order becomes ready only when every active job passed QC/finished
CREATE OR REPLACE FUNCTION public.film_sync_order_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_finished int;
BEGIN
  SELECT count(*) FILTER (WHERE status <> 'cancelled'),
         count(*) FILTER (WHERE status IN ('ready','done'))
    INTO v_total, v_finished
  FROM public.film_order_jobs WHERE order_id = NEW.order_id;

  IF v_total > 0 AND v_total = v_finished THEN
    UPDATE public.film_orders SET status = 'ready', updated_at = now()
     WHERE id = NEW.order_id AND status NOT IN ('ready','delivered','completed','cancelled');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS film_order_jobs_sync_ready ON public.film_order_jobs;
CREATE TRIGGER film_order_jobs_sync_ready
  AFTER UPDATE OF status ON public.film_order_jobs
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.film_sync_order_ready();

-- system notification helper with dedup + cooldown (service side only)
CREATE OR REPLACE FUNCTION public.film_raise_ops_notification(
  p_kind text, p_severity text, p_title text, p_body text,
  p_order_id uuid DEFAULT NULL, p_job_id uuid DEFAULT NULL, p_dept text DEFAULT NULL,
  p_assignee uuid DEFAULT NULL, p_dedup_key text DEFAULT NULL, p_cooldown_minutes int DEFAULT 60)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := coalesce(p_dedup_key, p_kind || ':' || coalesce(p_job_id::text, p_order_id::text, 'global')); v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.film_ops_notifications
   WHERE dedup_key = v_key
     AND (created_at > now() - make_interval(mins => p_cooldown_minutes) OR status IN ('new','snoozed'));
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.film_ops_notifications(kind, severity, title, body, order_id, job_id, dept, assignee_user_id, dedup_key)
  VALUES (p_kind, p_severity, p_title, p_body, p_order_id, p_job_id, p_dept, p_assignee, v_key || ':' || to_char(now(),'YYYYMMDDHH24MI'))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.film_raise_ops_notification(text,text,text,text,uuid,uuid,text,uuid,text,int) FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.film_raise_ops_notification(text,text,text,text,uuid,uuid,text,uuid,text,int) TO service_role;

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.film_ops_notifications;