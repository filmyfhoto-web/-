
-- Allow anon to read only published, active, non-deleted products
DROP POLICY IF EXISTS "anon read published products" ON public.products;
CREATE POLICY "anon read published products"
ON public.products
FOR SELECT
TO anon
USING (
  deleted_at IS NULL
  AND active = true
  AND status IN ('published'::product_status, 'low_stock'::product_status)
);

GRANT SELECT ON public.products TO anon;

-- Recreate products_public with security_invoker so it respects the caller's RLS
ALTER VIEW IF EXISTS public.products_public SET (security_invoker = true);

GRANT SELECT ON public.products_public TO anon, authenticated;
