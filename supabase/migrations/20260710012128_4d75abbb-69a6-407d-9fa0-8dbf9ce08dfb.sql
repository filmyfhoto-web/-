
-- 1) เพิ่มคอลัมน์ที่ mockup ต้องใช้
ALTER TABLE public.nw_work_orders
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS machine text,
  ADD COLUMN IF NOT EXISTS expected_completion timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid';

-- 2) ขยายค่า status ให้รับ mockup ใหม่ (คงค่าเดิมไว้เพื่อ backward compat)
ALTER TABLE public.nw_work_orders DROP CONSTRAINT IF EXISTS nw_work_orders_status_check;
ALTER TABLE public.nw_work_orders
  ADD CONSTRAINT nw_work_orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending','to_produce','designing','file_check','to_print','printing','delivered','cancelled'
  ]));

-- 3) ตารางประวัติการแจ้งลูกค้า
CREATE TABLE IF NOT EXISTS public.nw_customer_updates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.nw_work_orders(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'line',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nw_customer_updates_wo_idx ON public.nw_customer_updates(work_order_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_customer_updates TO authenticated;
GRANT ALL ON public.nw_customer_updates TO service_role;

ALTER TABLE public.nw_customer_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff can manage customer updates" ON public.nw_customer_updates;
CREATE POLICY "staff can manage customer updates"
  ON public.nw_customer_updates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_stores ss
      WHERE ss.store_id = nw_customer_updates.store_id AND ss.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_stores ss
      WHERE ss.store_id = nw_customer_updates.store_id AND ss.user_id = auth.uid()
    )
  );

-- 4) Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nw_customer_updates;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
