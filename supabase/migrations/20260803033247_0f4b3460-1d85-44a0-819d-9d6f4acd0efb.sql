DO $mig$
DECLARE
  d text;
  n text;
BEGIN
  -- 1) rds_apply_document_stock: add store-scoped staff check after doc load
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='rds_apply_document_stock';

  n := replace(d,
    E'RETURN jsonb_build_object(''applied'', 0, ''skipped'', 0, ''reason'', ''not_found'');\n  END IF;',
    E'RETURN jsonb_build_object(''applied'', 0, ''skipped'', 0, ''reason'', ''not_found'');\n  END IF;\n\n  IF NOT public.is_staff_of_store(auth.uid(), v_doc.store_id) THEN\n    RAISE EXCEPTION ''forbidden'';\n  END IF;');
  IF n = d THEN RAISE EXCEPTION 'guard insert failed: rds_apply_document_stock'; END IF;
  EXECUTE n;

  -- 2) rds_cancel_document
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='rds_cancel_document';
  n := replace(d,
    'IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION ''forbidden''; END IF;',
    'IF NOT public.is_staff_of_store(auth.uid(), (SELECT d2.store_id FROM public.rds_documents d2 WHERE d2.id = p_id)) THEN RAISE EXCEPTION ''forbidden''; END IF;');
  IF n = d THEN RAISE EXCEPTION 'guard replace failed: rds_cancel_document'; END IF;
  EXECUTE n;

  -- 3) rds_duplicate_document
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='rds_duplicate_document';
  n := replace(d,
    'IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION ''forbidden''; END IF;',
    'IF NOT public.is_staff_of_store(auth.uid(), (SELECT d2.store_id FROM public.rds_documents d2 WHERE d2.id = p_id)) THEN RAISE EXCEPTION ''forbidden''; END IF;');
  IF n = d THEN RAISE EXCEPTION 'guard replace failed: rds_duplicate_document'; END IF;
  EXECUTE n;

  -- 4) rds_soft_delete_documents / rds_restore_documents (array of ids)
  FOR n IN SELECT unnest(ARRAY['rds_soft_delete_documents','rds_restore_documents']) LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname = n;
    d := replace(d,
      'IF NOT is_staff_any(auth.uid()) THEN RAISE EXCEPTION ''forbidden''; END IF;',
      E'IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION ''forbidden''; END IF;\n  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;\n  IF EXISTS (SELECT 1 FROM public.rds_documents d2 WHERE d2.id = ANY(p_ids) AND NOT public.is_staff_of_store(auth.uid(), d2.store_id)) THEN RAISE EXCEPTION ''forbidden''; END IF;');
    IF position('is_staff_of_store' in d) = 0 THEN RAISE EXCEPTION 'guard replace failed: %', n; END IF;
    EXECUTE d;
  END LOOP;

  -- 5) rds_merge_customers
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='rds_merge_customers';
  n := replace(d,
    'IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION ''forbidden''; END IF;',
    E'IF NOT public.is_staff_of_store(auth.uid(), (SELECT c2.store_id FROM public.rds_customers c2 WHERE c2.id = p_target))\n     OR NOT public.is_staff_of_store(auth.uid(), (SELECT c3.store_id FROM public.rds_customers c3 WHERE c3.id = p_source)) THEN\n    RAISE EXCEPTION ''forbidden'';\n  END IF;');
  IF n = d THEN RAISE EXCEPTION 'guard replace failed: rds_merge_customers'; END IF;
  EXECUTE n;

  -- 6) rds_restore_from_sheets (store id is a parameter)
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname='public' AND p.proname='rds_restore_from_sheets';
  n := replace(d,
    'public.is_staff_any(auth.uid())',
    'public.is_staff_of_store(auth.uid(), p_store_id)');
  IF n = d THEN RAISE EXCEPTION 'guard replace failed: rds_restore_from_sheets'; END IF;
  EXECUTE n;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.rds_apply_document_stock(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_cancel_document(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_duplicate_document(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_soft_delete_documents(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_restore_documents(uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_merge_customers(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rds_restore_from_sheets(uuid, text, jsonb, jsonb) FROM anon;
