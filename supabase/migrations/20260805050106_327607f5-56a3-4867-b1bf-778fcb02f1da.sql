-- ===== 1. film_job_requests: LINE intake fields (additive) =====
ALTER TABLE public.film_job_requests
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS line_event_id text,
  ADD COLUMN IF NOT EXISTS line_message_id text,
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS line_display_name text,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_fields text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS linked_order_id uuid REFERENCES public.film_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_reply text,
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_design boolean,
  ADD COLUMN IF NOT EXISTS size_text text,
  ADD COLUMN IF NOT EXISTS requested_due_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS film_job_requests_line_event_id_key
  ON public.film_job_requests(line_event_id) WHERE line_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS film_job_requests_line_message_id_key
  ON public.film_job_requests(line_message_id) WHERE line_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS film_job_requests_intake_status_idx
  ON public.film_job_requests(intake_status, received_at DESC);

-- ===== 2. film_order_jobs: scheduling fields (additive) =====
ALTER TABLE public.film_order_jobs
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS planned_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS planned_finish_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS schedule_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS film_order_jobs_planned_start_idx
  ON public.film_order_jobs(planned_start_at);

-- ===== 3. queue settings (singleton per shop) =====
CREATE TABLE IF NOT EXISTS public.film_queue_settings (
  id text PRIMARY KEY DEFAULT 'default',
  timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  open_time text NOT NULL DEFAULT '08:30',
  close_time text NOT NULL DEFAULT '18:00',
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}'::integer[],
  capacity integer NOT NULL DEFAULT 1,
  buffer_minutes integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_queue_settings TO authenticated;
GRANT ALL ON public.film_queue_settings TO service_role;
ALTER TABLE public.film_queue_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage queue settings" ON public.film_queue_settings
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.film_queue_settings(id) VALUES ('default') ON CONFLICT DO NOTHING;

-- ===== 4. standard duration per job type =====
CREATE TABLE IF NOT EXISTS public.film_job_type_durations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL UNIQUE,
  label text,
  setup_minutes integer NOT NULL DEFAULT 15,
  minutes_per_unit numeric NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_job_type_durations TO authenticated;
GRANT ALL ON public.film_job_type_durations TO service_role;
ALTER TABLE public.film_job_type_durations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage job type durations" ON public.film_job_type_durations
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.film_job_type_durations(job_type, label, setup_minutes, minutes_per_unit) VALUES
  ('vinyl', 'ไวนิล', 20, 15),
  ('sticker', 'สติกเกอร์', 15, 8),
  ('print', 'งานพิมพ์ทั่วไป', 10, 3),
  ('design', 'ออกแบบ', 30, 30),
  ('other', 'อื่น ๆ', 15, 10)
ON CONFLICT (job_type) DO NOTHING;

-- ===== 5. schedule edit history =====
CREATE TABLE IF NOT EXISTS public.film_job_schedule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_job_id uuid NOT NULL REFERENCES public.film_order_jobs(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.film_orders(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.film_job_schedule_history TO authenticated;
GRANT ALL ON public.film_job_schedule_history TO service_role;
ALTER TABLE public.film_job_schedule_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read schedule history" ON public.film_job_schedule_history
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write schedule history" ON public.film_job_schedule_history
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- ===== 6. updated_at triggers =====
DROP TRIGGER IF EXISTS film_queue_settings_touch ON public.film_queue_settings;
CREATE TRIGGER film_queue_settings_touch BEFORE UPDATE ON public.film_queue_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
DROP TRIGGER IF EXISTS film_job_type_durations_touch ON public.film_job_type_durations;
CREATE TRIGGER film_job_type_durations_touch BEFORE UPDATE ON public.film_job_type_durations
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ===== 7. realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.film_queue_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.film_job_type_durations;