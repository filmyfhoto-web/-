-- Real-goods documents deduct stock; bill-only documents never do.
CREATE OR REPLACE FUNCTION public.rds_apply_document_stock(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc      public.rds_documents;
  v_it       record;
  v_pid      uuid;
  v_before   numeric;
  v_applied  int := 0;
  v_skipped  int := 0;
BEGIN
  SELECT * INTO v_doc FROM public.rds_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', 0, 'skipped', 0, 'reason', 'not_found');
  END IF;

  IF COALESCE(v_doc.internal_sale_type, 'real_goods') <> 'real_goods'
     OR v_doc.deleted_at IS NOT NULL
     OR lower(COALESCE(v_doc.status, '')) IN ('cancelled', 'canceled', 'void', 'draft')
     OR COALESCE(v_doc.document_type, '') NOT IN ('receipt', 'delivery', 'tax_invoice') THEN
    RETURN jsonb_build_object('applied', 0, 'skipped', 0, 'reason', 'not_applicable');
  END IF;

  FOR v_it IN
    SELECT i.id, i.product_id, i.name, i.quantity
    FROM public.rds_document_items i
    WHERE i.document_id = p_document_id AND COALESCE(i.quantity, 0) > 0
  LOOP
    v_pid := NULL;

    -- 1) direct link through the store catalog
    IF v_it.product_id IS NOT NULL THEN
      SELECT rp.canonical_product_id INTO v_pid
      FROM public.rds_products rp
      WHERE rp.id = v_it.product_id;

      IF v_pid IS NULL THEN
        -- 2) fall back to barcode / sku / name match
        SELECT p.id INTO v_pid
        FROM public.rds_products rp
        JOIN public.products p
          ON p.deleted_at IS NULL
         AND (
              (rp.barcode IS NOT NULL AND rp.barcode <> '' AND p.barcode = rp.barcode)
           OR (rp.sku IS NOT NULL AND rp.sku <> '' AND p.code = rp.sku)
           OR (lower(btrim(p.name)) = lower(btrim(rp.name)))
         )
        WHERE rp.id = v_it.product_id
        LIMIT 1;
      END IF;
    END IF;

    -- 3) last resort: match the printed line name to a product name
    IF v_pid IS NULL AND v_it.name IS NOT NULL AND btrim(v_it.name) <> '' THEN
      SELECT p.id INTO v_pid
      FROM public.products p
      WHERE p.deleted_at IS NULL
        AND lower(btrim(p.name)) = lower(btrim(v_it.name))
      LIMIT 1;
    END IF;

    IF v_pid IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(stock, 0) INTO v_before FROM public.products WHERE id = v_pid FOR UPDATE;

    INSERT INTO public.stock_movements (
      product_id, move_type, qty, reason, ref_type, ref_id, reference, note,
      before_qty, after_qty, idempotency_key, created_by
    ) VALUES (
      v_pid, 'out', v_it.quantity, 'sell_out', 'rds_document', p_document_id,
      v_doc.document_no, 'ขายจริงจากเอกสาร ' || COALESCE(v_doc.document_no, ''),
      v_before, v_before - v_it.quantity,
      'rdsdoc:' || p_document_id::text || ':' || v_it.id::text,
      auth.uid()
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

    IF FOUND THEN
      UPDATE public.products
         SET stock = COALESCE(stock, 0) - v_it.quantity, updated_at = now()
       WHERE id = v_pid;
      v_applied := v_applied + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.rds_apply_document_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rds_apply_document_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rds_apply_document_stock(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_rds_documents_sale_type_store
  ON public.rds_documents(internal_sale_type, store_id, created_at DESC);