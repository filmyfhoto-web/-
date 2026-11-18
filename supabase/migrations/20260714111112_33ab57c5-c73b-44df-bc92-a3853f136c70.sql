-- Scope rds_document_layouts staff policy to authenticated only
DROP POLICY IF EXISTS "rds_document_layouts staff all" ON public.rds_document_layouts;
CREATE POLICY "rds_document_layouts staff all"
ON public.rds_document_layouts
FOR ALL
TO authenticated
USING (is_staff_of_store(auth.uid(), store_id))
WITH CHECK (is_staff_of_store(auth.uid(), store_id));

-- Split product_images "staff_any read images" into two role-scoped policies
DROP POLICY IF EXISTS "staff_any read images" ON public.product_images;

CREATE POLICY "staff_any read images"
ON public.product_images
FOR SELECT
TO authenticated
USING (
  is_staff_any(auth.uid())
  OR (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_images.product_id
        AND p.active = true
        AND p.status = ANY (ARRAY['published'::product_status, 'low_stock'::product_status])
    )
  )
);

CREATE POLICY "anon read approved images"
ON public.product_images
FOR SELECT
TO anon
USING (
  status = 'approved'
  AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_images.product_id
      AND p.active = true
      AND p.status = ANY (ARRAY['published'::product_status, 'low_stock'::product_status])
  )
);