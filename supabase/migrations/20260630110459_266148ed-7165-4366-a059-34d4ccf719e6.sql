CREATE OR REPLACE FUNCTION public.rds_merge_customers(p_target uuid, p_source uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t public.rds_customers;
  v_s public.rds_customers;
  v_moved int;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_target IS NULL OR p_source IS NULL OR p_target = p_source THEN
    RAISE EXCEPTION 'invalid params';
  END IF;
  SELECT * INTO v_t FROM public.rds_customers WHERE id = p_target;
  SELECT * INTO v_s FROM public.rds_customers WHERE id = p_source;
  IF v_t.id IS NULL OR v_s.id IS NULL THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF v_t.store_id <> v_s.store_id THEN RAISE EXCEPTION 'different stores'; END IF;

  -- fill missing fields on target from source
  UPDATE public.rds_customers SET
    phone       = COALESCE(NULLIF(v_t.phone,''),       NULLIF(v_s.phone,'')),
    address     = COALESCE(NULLIF(v_t.address,''),     NULLIF(v_s.address,'')),
    tax_id      = COALESCE(NULLIF(v_t.tax_id,''),      NULLIF(v_s.tax_id,'')),
    branch_name = COALESCE(NULLIF(v_t.branch_name,''), NULLIF(v_s.branch_name,'')),
    email       = COALESCE(NULLIF(v_t.email,''),       NULLIF(v_s.email,'')),
    org_id      = COALESCE(v_t.org_id, v_s.org_id),
    updated_at  = now()
  WHERE id = p_target;

  -- reassign documents
  UPDATE public.rds_documents SET customer_id = p_target WHERE customer_id = p_source;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- delete source
  DELETE FROM public.rds_customers WHERE id = p_source;

  INSERT INTO public.rds_activity_logs(store_id, user_id, action, target_type, target_id, detail)
  VALUES (v_t.store_id, auth.uid(), 'customer_merge', 'customer', p_target,
          jsonb_build_object('source_id', p_source, 'source_name', v_s.name,
                             'documents_moved', v_moved));

  RETURN jsonb_build_object('target_id', p_target, 'documents_moved', v_moved);
END $$;

GRANT EXECUTE ON FUNCTION public.rds_merge_customers(uuid, uuid) TO authenticated;