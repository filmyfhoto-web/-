ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.product_costs REPLICA IDENTITY FULL;
ALTER TABLE public.group_prices REPLICA IDENTITY FULL;
ALTER TABLE public.customer_prices REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_costs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_prices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_prices;