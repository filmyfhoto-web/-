GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_purchase_orders TO authenticated;
GRANT ALL ON public.customer_purchase_orders TO service_role;
REVOKE ALL ON public.customer_purchase_orders FROM anon;
GRANT SELECT ON public.product_variants TO authenticated;