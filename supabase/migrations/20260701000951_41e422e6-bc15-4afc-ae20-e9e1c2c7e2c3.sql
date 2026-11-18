
-- Restore Data API grants that were dropped from public.products (RLS still enforces row access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- Ensure related product tables also have grants (idempotent)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_shops TO authenticated;
GRANT ALL ON public.product_shops TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_costs TO authenticated;
GRANT ALL ON public.product_costs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT ALL ON public.product_images TO service_role;
