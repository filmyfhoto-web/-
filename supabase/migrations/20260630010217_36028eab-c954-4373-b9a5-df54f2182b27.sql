
DROP VIEW IF EXISTS public.products_public;
CREATE VIEW public.products_public
WITH (security_invoker = true) AS
SELECT id, code, barcode, name, category_id, description, unit, image_url,
       standard_price, active, status, stock, low_stock_threshold,
       created_at, updated_at
FROM public.products
WHERE active = true AND status = ANY (ARRAY['published'::product_status, 'low_stock'::product_status]);

GRANT SELECT ON public.products_public TO anon, authenticated;
