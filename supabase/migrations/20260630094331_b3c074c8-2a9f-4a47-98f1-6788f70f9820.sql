
-- Soft delete support for products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at);

-- Tighten customer-visible select: must not be deleted
DROP POLICY IF EXISTS "staff_any read products" ON public.products;
CREATE POLICY "staff_any read products" ON public.products
FOR SELECT
USING (
  public.is_staff_any(auth.uid())
  OR (deleted_at IS NULL AND active = true AND status = ANY (ARRAY['published'::product_status, 'low_stock'::product_status]))
);

-- Usage summary: how many orders / documents / stock reference this product
CREATE OR REPLACE FUNCTION public.admin_product_usage(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders int;
  v_docs int;
  v_stock numeric;
  v_name text;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT name, COALESCE(stock,0) INTO v_name, v_stock FROM public.products WHERE id = p_id;
  SELECT count(*) INTO v_orders FROM public.order_items WHERE product_id = p_id;
  SELECT count(*) INTO v_docs FROM public.rds_document_items WHERE product_id = p_id;
  RETURN jsonb_build_object(
    'name', v_name,
    'order_item_count', v_orders,
    'document_item_count', v_docs,
    'stock_remaining', v_stock
  );
END $$;

-- Soft delete
CREATE OR REPLACE FUNCTION public.admin_soft_delete_products(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.products
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         active = false,
         updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  SELECT auth.uid(), 'product_soft_delete', 'product', id, jsonb_build_object('count', v_count)
    FROM unnest(p_ids) AS id;
  RETURN v_count;
END $$;

-- Restore
CREATE OR REPLACE FUNCTION public.admin_restore_products(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.products
     SET deleted_at = NULL,
         deleted_by = NULL,
         active = true,
         updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO public.activity_logs(user_id, action, target_type, target_id, detail)
  SELECT auth.uid(), 'product_restore', 'product', id, '{}'::jsonb
    FROM unnest(p_ids) AS id;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_product_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_products(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_products(uuid[]) TO authenticated;
