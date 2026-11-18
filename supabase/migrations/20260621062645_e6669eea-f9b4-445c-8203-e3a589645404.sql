
-- 1) Remove sensitive pricing tables from realtime broadcast to prevent leakage
ALTER PUBLICATION supabase_realtime DROP TABLE public.product_costs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_prices;
ALTER PUBLICATION supabase_realtime DROP TABLE public.group_prices;

-- 2) Tighten product_images SELECT: non-staff only see approved images of active+published products
DROP POLICY IF EXISTS "staff_any read images" ON public.product_images;
CREATE POLICY "staff_any read images" ON public.product_images
FOR SELECT
USING (
  is_staff_any(auth.uid())
  OR (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.active = true
        AND p.status IN ('published','low_stock')
    )
  )
);

-- 3) Restrict customer self-inserts on activity_logs to a safe whitelist of actions
DROP POLICY IF EXISTS "users insert own logs" ON public.activity_logs;
CREATE POLICY "users insert own logs" ON public.activity_logs
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    is_staff(auth.uid())
    OR action IN ('submit_order','login','logout')
  )
);
