ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_unit_links;
ALTER TABLE public.product_variants REPLICA IDENTITY FULL;
ALTER TABLE public.product_unit_links REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;