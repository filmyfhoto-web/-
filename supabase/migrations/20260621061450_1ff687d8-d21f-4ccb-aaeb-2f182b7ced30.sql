DROP POLICY "staff_any read images" ON public.product_images;
CREATE POLICY "staff_any read images" ON public.product_images
FOR SELECT TO authenticated
USING (
  is_staff_any(auth.uid())
  OR (
    status = 'approved'
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND p.active = true)
  )
);