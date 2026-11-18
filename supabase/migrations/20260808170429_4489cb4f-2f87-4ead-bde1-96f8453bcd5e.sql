-- 1) order items enrichment
ALTER TABLE public.film_order_items
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dept text,
  ADD COLUMN IF NOT EXISTS is_outsourced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES public.film_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) production jobs enrichment
ALTER TABLE public.film_order_jobs
  ADD COLUMN IF NOT EXISTS job_no text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS dept text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_outsourced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.film_orders
  ADD COLUMN IF NOT EXISTS internal_job_no text;

CREATE UNIQUE INDEX IF NOT EXISTS film_orders_internal_job_no_key
  ON public.film_orders(internal_job_no) WHERE internal_job_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.film_next_internal_job_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'JOB-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM') || '-';
  next_seq integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(internal_job_no, '^.*-', ''), '')::int), 0) + 1
    INTO next_seq
    FROM public.film_orders
   WHERE internal_job_no LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 3, '0');
END;
$$;

-- 3) outsource work orders
CREATE TABLE IF NOT EXISTS public.film_outsource_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.film_orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  total_cost numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_outsource_orders TO authenticated;
GRANT ALL ON public.film_outsource_orders TO service_role;
ALTER TABLE public.film_outsource_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_outsource_orders" ON public.film_outsource_orders
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.film_outsource_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outsource_id uuid NOT NULL REFERENCES public.film_outsource_orders(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.film_order_jobs(id) ON DELETE SET NULL,
  title text NOT NULL,
  size text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,
  material text,
  finishing text,
  cost_price numeric NOT NULL DEFAULT 0,
  note text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_outsource_items TO authenticated;
GRANT ALL ON public.film_outsource_items TO service_role;
ALTER TABLE public.film_outsource_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_outsource_items" ON public.film_outsource_items
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

ALTER TABLE public.film_order_jobs
  ADD COLUMN IF NOT EXISTS outsource_id uuid REFERENCES public.film_outsource_orders(id) ON DELETE SET NULL;

-- history/events
ALTER TABLE public.film_order_events
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'status';

CREATE INDEX IF NOT EXISTS film_order_jobs_status_idx ON public.film_order_jobs(status);
CREATE INDEX IF NOT EXISTS film_order_jobs_dept_idx ON public.film_order_jobs(dept);
CREATE INDEX IF NOT EXISTS film_order_jobs_due_idx ON public.film_order_jobs(due_at);
CREATE INDEX IF NOT EXISTS film_outsource_items_outsource_idx ON public.film_outsource_items(outsource_id);
CREATE INDEX IF NOT EXISTS film_outsource_orders_supplier_idx ON public.film_outsource_orders(supplier_id);

CREATE OR REPLACE FUNCTION public.film_next_outsource_no()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'WO-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM') || '-';
  next_seq integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(wo_no, '^.*-', ''), '')::int), 0) + 1
    INTO next_seq FROM public.film_outsource_orders WHERE wo_no LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 3, '0');
END;
$$;

CREATE TRIGGER film_outsource_orders_touch BEFORE UPDATE ON public.film_outsource_orders
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER film_outsource_items_touch BEFORE UPDATE ON public.film_outsource_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();