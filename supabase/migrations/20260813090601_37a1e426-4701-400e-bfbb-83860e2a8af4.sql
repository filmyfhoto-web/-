DO $$
DECLARE
  v_colorlab uuid := '99723b88-97ea-4454-b7ac-b5a61be5114d';
  v_printing uuid := '0fe70906-0dc7-4682-bad5-df45c8c72e86';
  v_qt_issued uuid; v_qt_draft uuid; v_new uuid; v_no text;
  v_items int; v_src uuid; v_srcno text; v_cust text;
  v_ok boolean;
BEGIN
  -- ── ใบเสนอราคาต้นทาง (issued) ของ Colorlab ─────────────────────────
  INSERT INTO public.rds_documents (store_id, document_type, document_no, document_date,
    customer_name, customer_phone, subtotal, grand_total, net_total, status, created_source)
  VALUES (v_colorlab, 'quotation', 'QT-TEST-QF1', current_date,
    'โรงเรียนทดสอบ A', '0812345678', 50, 50, 50, 'issued', 'manual')
  RETURNING id INTO v_qt_issued;

  INSERT INTO public.rds_document_items (document_id, item_order, name, price, quantity, unit, line_total)
  VALUES (v_qt_issued, 1, 'ปากกา', 5, 10, 'ด้าม', 50);

  -- ใบเสนอราคาฉบับร่าง
  INSERT INTO public.rds_documents (store_id, document_type, document_no, document_date,
    customer_name, subtotal, grand_total, net_total, status, created_source)
  VALUES (v_colorlab, 'quotation', 'QT-TEST-QF2', current_date, 'โรงเรียนทดสอบ B', 10, 10, 10, 'draft', 'manual')
  RETURNING id INTO v_qt_draft;

  -- D) สร้างใบส่งของจากบอทโดยไม่มีต้นทาง → ต้องถูกบล็อก
  v_ok := false;
  BEGIN
    INSERT INTO public.rds_documents (store_id, document_type, document_no, document_date,
      customer_name, subtotal, grand_total, net_total, status, created_source)
    VALUES (v_colorlab, 'delivery', 'DN-TEST-QF-X', current_date, 'ลูกค้าทดสอบ', 1, 1, 1, 'issued', 'line_bot');
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST D FAILED: bot delivery without quotation was allowed'; END IF;

  -- E) ต้นทางเป็นฉบับร่าง → ต้องถูกบล็อก
  v_ok := false;
  BEGIN
    PERFORM public.rds_create_next_doc_from_quotation(v_qt_draft, 'delivery', NULL, 'line_bot', v_colorlab);
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST E FAILED: draft quotation allowed as source'; END IF;

  -- G) ข้ามร้าน → ต้องถูกบล็อก
  v_ok := false;
  BEGIN
    PERFORM public.rds_create_next_doc_from_quotation(v_qt_issued, 'delivery', NULL, 'line_bot', v_printing);
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'TEST G FAILED: cross-store source allowed'; END IF;

  -- F) ต้นทาง issued → สร้างใบส่งของได้ + source link + คัดลอกข้อมูล
  SELECT r.doc_no, r.document_id INTO v_no, v_new
  FROM public.rds_create_next_doc_from_quotation(v_qt_issued, 'delivery', NULL, 'line_bot', v_colorlab) r;
  IF v_no IS NULL OR v_new IS NULL THEN RAISE EXCEPTION 'TEST F FAILED: no doc created'; END IF;

  SELECT source_document_id, source_document_no, customer_name
    INTO v_src, v_srcno, v_cust FROM public.rds_documents WHERE id = v_new;
  IF v_src <> v_qt_issued OR v_srcno <> 'QT-TEST-QF1' THEN
    RAISE EXCEPTION 'TEST F FAILED: source link wrong (% / %)', v_src, v_srcno;
  END IF;
  IF v_cust <> 'โรงเรียนทดสอบ A' THEN RAISE EXCEPTION 'TEST F FAILED: customer not copied'; END IF;
  SELECT count(*) INTO v_items FROM public.rds_document_items WHERE document_id = v_new;
  IF v_items <> 1 THEN RAISE EXCEPTION 'TEST F FAILED: items not copied (%)', v_items; END IF;

  -- ล้างข้อมูลทดสอบทั้งหมด
  DELETE FROM public.rds_document_items WHERE document_id IN (v_new, v_qt_issued, v_qt_draft);
  DELETE FROM public.rds_documents WHERE id IN (v_new, v_qt_issued, v_qt_draft);

  RAISE NOTICE 'QUOTATION-FIRST DB TESTS PASSED (D/E/F/G)';
END $$;