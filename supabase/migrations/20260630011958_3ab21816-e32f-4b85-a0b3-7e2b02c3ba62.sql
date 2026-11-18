
DROP VIEW IF EXISTS public.product_shops_view;
CREATE VIEW public.product_shops_view
WITH (security_invoker = true) AS
SELECT ps.product_id,
       ps.store_id,
       s.name AS store_name,
       ps.price, ps.stock, ps.barcode, ps.active,
       ps.updated_at
FROM public.product_shops ps
JOIN public.rds_stores s ON s.id = ps.store_id;

GRANT SELECT ON public.product_shops_view TO anon, authenticated;
