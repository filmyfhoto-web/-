-- 1) Excel original file traceability (additive)
ALTER TABLE public.customer_excel_intakes ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE public.customer_excel_intakes ADD COLUMN IF NOT EXISTS storage_path text;

-- 2) Item normalisation helpers (mirror of src/lib/customer360/convertItems.ts)
CREATE OR REPLACE FUNCTION public.excel_items_to_requisition(p_items jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', 'xls_' || ord::text,
      'code', coalesce(it->>'code', ''),
      'name', btrim(coalesce(it->>'name', '')),
      'unit', coalesce(nullif(btrim(coalesce(it->>'unit','')), ''), 'ชิ้น'),
      'price', coalesce((it->>'price')::numeric, 0),
      'qty', GREATEST(coalesce((it->>'qty')::numeric, 0), 1),
      'source', 'import',
      'needsReview', coalesce((it->>'needsReview')::boolean, false)
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(it, ord);
$$;

CREATE OR REPLACE FUNCTION public.excel_items_to_po(p_items jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'key', 'xls_' || ord::text,
      'name', btrim(coalesce(it->>'name', '')),
      'quantity', GREATEST(coalesce((it->>'qty')::numeric, 0), 1),
      'unit', coalesce(nullif(btrim(coalesce(it->>'unit','')), ''), 'ชิ้น'),
      'price', coalesce((it->>'price')::numeric, 0)
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(it, ord);
$$;

-- 3) Convert with the correct per-system item shape + idempotency
CREATE OR REPLACE FUNCTION public.admin_convert_excel_intake(p_id uuid, p_target text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.customer_excel_intakes%ROWTYPE; v_new uuid; v_po text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.customer_excel_intakes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF r.converted_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'target', r.converted_to, 'id', r.converted_id);
  END IF;

  IF p_target = 'requisition' THEN
    INSERT INTO public.school_requisitions (user_id, school_name, project_name, prepared_by, doc_date, status, items, total, note, submitted_at)
    VALUES (r.user_id, coalesce(nullif(r.school_name, ''), '-'), 'นำเข้าจาก Excel', coalesce(nullif(r.customer_name,''), '-'), current_date,
            'submitted', public.excel_items_to_requisition(r.items), r.total, r.note, now())
    RETURNING id INTO v_new;
  ELSIF p_target = 'purchase_order' THEN
    BEGIN
      SELECT public.next_customer_po_number() INTO v_po;
    EXCEPTION WHEN OTHERS THEN v_po := NULL;
    END;
    INSERT INTO public.customer_purchase_orders (po_number, user_id, customer_name, customer_phone, school_or_org, document_date, items, subtotal, net_total, note, status, source, submitted_at)
    VALUES (v_po, r.user_id, coalesce(nullif(r.customer_name, ''), '-'), r.phone, r.school_name, current_date,
            public.excel_items_to_po(r.items), r.total, r.total, r.note, 'submitted', 'excel_intake', now())
    RETURNING id INTO v_new;
  ELSE
    RAISE EXCEPTION 'invalid_target';
  END IF;

  UPDATE public.customer_excel_intakes
     SET status = 'converted', converted_to = p_target, converted_id = v_new, converted_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'target', p_target, 'id', v_new);
END $$;

REVOKE ALL ON FUNCTION public.admin_convert_excel_intake(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_convert_excel_intake(uuid, text) TO authenticated;

-- 4) Manual LINE bind: conflict-safe + sync profile identity
CREATE OR REPLACE FUNCTION public.admin_bind_line_customer(
  p_line_user_id text, p_customer_id uuid, p_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid; v_name text; v_is_profile boolean := false;
  v_profile_line text; v_other uuid; v_display text; v_pic text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_line_user_id IS NULL OR p_customer_id IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;

  SELECT customer_id INTO v_existing FROM public.line_account_links WHERE line_user_id = p_line_user_id;
  IF v_existing IS NOT NULL AND v_existing <> p_customer_id AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'reason', 'line_bound_to_other_customer', 'existing_customer_id', v_existing);
  END IF;

  SELECT full_name, line_user_id, true INTO v_name, v_profile_line, v_is_profile
    FROM public.profiles WHERE id = p_customer_id;

  IF v_is_profile THEN
    -- โปรไฟล์นี้ผูกกับ LINE อื่นอยู่แล้ว -> ต้องยืนยันก่อน ห้ามทับเงียบ ๆ
    IF v_profile_line IS NOT NULL AND v_profile_line <> p_line_user_id AND NOT p_force THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'reason', 'customer_bound_to_other_line');
    END IF;
    -- LINE นี้ถูกใช้โดยโปรไฟล์คนอื่นอยู่ -> ต้องยืนยันก่อน
    SELECT id INTO v_other FROM public.profiles
      WHERE line_user_id = p_line_user_id AND id <> p_customer_id LIMIT 1;
    IF v_other IS NOT NULL AND NOT p_force THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'reason', 'line_used_by_other_profile', 'existing_customer_id', v_other);
    END IF;
  END IF;

  SELECT display_name, picture_url INTO v_display, v_pic
    FROM public.line_account_links WHERE line_user_id = p_line_user_id;

  INSERT INTO public.line_account_links (line_user_id, customer_id, customer_source, verified_at, updated_at)
  VALUES (p_line_user_id, p_customer_id, CASE WHEN v_is_profile THEN 'profile' ELSE 'admin_manual' END, now(), now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET customer_id = EXCLUDED.customer_id,
        customer_source = EXCLUDED.customer_source,
        verified_at = now(),
        updated_at = now();

  IF v_is_profile THEN
    -- ปลดของโปรไฟล์อื่นที่ถือ line_user_id เดียวกัน (เฉพาะกรณี force)
    UPDATE public.profiles
       SET line_user_id = NULL, line_verified_at = NULL
     WHERE line_user_id = p_line_user_id AND id <> p_customer_id;

    UPDATE public.profiles
       SET line_user_id = p_line_user_id,
           line_display_name = coalesce(line_display_name, v_display),
           line_picture_url = coalesce(line_picture_url, v_pic),
           line_verified_at = coalesce(line_verified_at, now())
     WHERE id = p_customer_id;
  END IF;

  INSERT INTO public.security_audit_log (event_type, severity, actor_user_id, target_type, target_id, detail)
  VALUES ('line_bind_customer', 'info', auth.uid(), 'line_account_links', p_line_user_id,
          jsonb_build_object('customer_id', p_customer_id, 'customer_name', v_name,
                             'previous_customer_id', v_existing, 'forced', p_force,
                             'profile_synced', v_is_profile));

  RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id, 'profile_synced', v_is_profile);
END $$;

REVOKE ALL ON FUNCTION public.admin_bind_line_customer(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_bind_line_customer(text, uuid, boolean) TO authenticated;

-- 5) Unbind: revoke link + clear ONLY the profile holding this same line_user_id
CREATE OR REPLACE FUNCTION public.admin_unbind_line_customer(p_line_user_id text, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_rows int := 0; v_cleared int := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT customer_id INTO v_existing FROM public.line_account_links WHERE line_user_id = p_line_user_id;

  UPDATE public.line_account_links
     SET customer_id = NULL, customer_source = 'admin_unbound', verified_at = NULL, updated_at = now()
   WHERE line_user_id = p_line_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.profiles
     SET line_user_id = NULL, line_verified_at = NULL
   WHERE line_user_id = p_line_user_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  IF v_rows = 0 AND v_cleared = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_bound');
  END IF;

  INSERT INTO public.security_audit_log (event_type, severity, actor_user_id, target_type, target_id, detail)
  VALUES ('line_unbind_customer', 'warn', auth.uid(), 'line_account_links', p_line_user_id,
          jsonb_build_object('previous_customer_id', v_existing, 'reason', p_reason, 'profiles_cleared', v_cleared));

  RETURN jsonb_build_object('ok', true, 'profiles_cleared', v_cleared);
END $$;

REVOKE ALL ON FUNCTION public.admin_unbind_line_customer(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_unbind_line_customer(text, text) TO authenticated;