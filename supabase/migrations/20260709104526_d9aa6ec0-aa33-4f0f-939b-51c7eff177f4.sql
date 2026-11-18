
-- Add columns to nw_work_orders (nullable, safe defaults, no data impact)
ALTER TABLE public.nw_work_orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS line_raw_text text,
  ADD COLUMN IF NOT EXISTS deposit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS progress_pct integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_date date;

-- Channel check (soft)
DO $$ BEGIN
  ALTER TABLE public.nw_work_orders
    ADD CONSTRAINT nw_work_orders_channel_chk
    CHECK (channel IN ('line','walk_in','phone','facebook','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- nw_price_templates
CREATE TABLE IF NOT EXISTS public.nw_price_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_price_templates TO authenticated;
GRANT ALL ON public.nw_price_templates TO service_role;
ALTER TABLE public.nw_price_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nw_price_templates access" ON public.nw_price_templates;
CREATE POLICY "nw_price_templates access" ON public.nw_price_templates
  FOR ALL TO authenticated
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));

DROP TRIGGER IF EXISTS trg_nw_price_templates_updated ON public.nw_price_templates;
CREATE TRIGGER trg_nw_price_templates_updated
  BEFORE UPDATE ON public.nw_price_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- nw_activity
CREATE TABLE IF NOT EXISTS public.nw_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES public.nw_work_orders(id) ON DELETE CASCADE,
  actor uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_activity_store_created ON public.nw_activity(store_id, created_at DESC);
GRANT SELECT, INSERT ON public.nw_activity TO authenticated;
GRANT ALL ON public.nw_activity TO service_role;
ALTER TABLE public.nw_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nw_activity access" ON public.nw_activity;
CREATE POLICY "nw_activity access" ON public.nw_activity
  FOR SELECT TO authenticated
  USING (public.nw_has_store_access(store_id));
DROP POLICY IF EXISTS "nw_activity insert" ON public.nw_activity;
CREATE POLICY "nw_activity insert" ON public.nw_activity
  FOR INSERT TO authenticated
  WITH CHECK (public.nw_has_store_access(store_id));
