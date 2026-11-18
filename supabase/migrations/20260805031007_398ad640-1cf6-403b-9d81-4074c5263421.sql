-- ===== Film Shop orders (additive) =====
CREATE TABLE IF NOT EXISTS public.film_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.film_customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  channel text NOT NULL DEFAULT 'walkin',
  title text NOT NULL DEFAULT '',
  due_at timestamptz,
  is_urgent boolean NOT NULL DEFAULT false,
  has_design boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'waiting_info',
  payment_status text NOT NULL DEFAULT 'unpaid',
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  is_draft boolean NOT NULL DEFAULT false,
  source_job_request_id uuid REFERENCES public.film_job_requests(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_orders TO authenticated;
GRANT ALL ON public.film_orders TO service_role;
ALTER TABLE public.film_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_orders" ON public.film_orders
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.film_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.film_orders(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'ชิ้น',
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_items TO authenticated;
GRANT ALL ON public.film_order_items TO service_role;
ALTER TABLE public.film_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_order_items" ON public.film_order_items
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.film_order_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.film_orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.film_order_items(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'waiting_info',
  sort_order integer NOT NULL DEFAULT 0,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_jobs TO authenticated;
GRANT ALL ON public.film_order_jobs TO service_role;
ALTER TABLE public.film_order_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_order_jobs" ON public.film_order_jobs
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.film_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.film_orders(id) ON DELETE CASCADE,
  order_job_id uuid REFERENCES public.film_order_jobs(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.film_order_events TO authenticated;
GRANT ALL ON public.film_order_events TO service_role;
ALTER TABLE public.film_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read film_order_events" ON public.film_order_events
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "staff insert film_order_events" ON public.film_order_events
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS film_orders_status_idx ON public.film_orders(status);
CREATE INDEX IF NOT EXISTS film_orders_due_idx ON public.film_orders(due_at);
CREATE INDEX IF NOT EXISTS film_orders_customer_idx ON public.film_orders(customer_id);
CREATE INDEX IF NOT EXISTS film_order_items_order_idx ON public.film_order_items(order_id);
CREATE INDEX IF NOT EXISTS film_order_jobs_order_idx ON public.film_order_jobs(order_id);
CREATE INDEX IF NOT EXISTS film_order_jobs_status_idx ON public.film_order_jobs(status);
CREATE INDEX IF NOT EXISTS film_order_events_order_idx ON public.film_order_events(order_id);

-- link documents back to their source order (additive)
ALTER TABLE public.film_invoices
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.film_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS film_invoices_source_order_idx ON public.film_invoices(source_order_id);

-- updated_at triggers (reuse existing helper)
CREATE TRIGGER film_orders_touch BEFORE UPDATE ON public.film_orders
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER film_order_items_touch BEFORE UPDATE ON public.film_order_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER film_order_jobs_touch BEFORE UPDATE ON public.film_order_jobs
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- order number generator: OR-YYMM-####
CREATE OR REPLACE FUNCTION public.film_next_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text := 'OR-' || to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMM') || '-';
  next_seq integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_no, '^.*-', ''), '')::int), 0) + 1
    INTO next_seq
    FROM public.film_orders
   WHERE order_no LIKE prefix || '%';
  RETURN prefix || lpad(next_seq::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.film_next_order_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.film_next_order_number() TO authenticated, service_role;