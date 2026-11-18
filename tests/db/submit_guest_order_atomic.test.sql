-- Integration tests for public.submit_guest_order_atomic
-- Run: psql -v ON_ERROR_STOP=1 -f tests/db/submit_guest_order_atomic.test.sql
--
-- Everything runs inside a single transaction and is ROLLBACK-ed at the end so
-- production data is never mutated.

\set ON_ERROR_STOP on
\set QUIET 1
SET client_min_messages = warning;
BEGIN;

DO $$
DECLARE
  v_line_uid text := 'U' || replace(gen_random_uuid()::text, '-', '');
  v_key      text := 'idem_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_order    jsonb;
  v_items    jsonb;
  v_order2   jsonb;
  v_r1       record;
  v_r2       record;
  v_cnt      int;
  v_item_cnt int;
  v_evt_cnt  int;
  v_err_hit  boolean := false;
BEGIN
  -- Seed binding for the fake user.
  INSERT INTO public.line_account_links (line_user_id, phone) VALUES (v_line_uid, '0812345678');

  v_items := jsonb_build_array(
    jsonb_build_object('product_name', 'A', 'qty', 2, 'price', 50, 'total', 100),
    jsonb_build_object('product_name', 'B', 'qty', 1, 'price', 30, 'total', 30)
  );
  v_order := jsonb_build_object(
    'order_no', 'SO-TEST-' || substr(v_line_uid, 2, 8),
    'guest_id', gen_random_uuid()::text,
    'guest_name', 'ทดสอบ',
    'guest_phone', '0812345678',
    'project_name', 'unit-test',
    'line_link_token', 'tok_' || substr(v_line_uid, 2, 12),
    'subtotal', 130,
    'total', 130,
    'customer_snapshot', jsonb_build_object('idempotency_key', v_key)
  );

  --------------------------------------------------------------------
  -- Case 1: first call inserts order + 2 items + 1 status event.
  --------------------------------------------------------------------
  SELECT * INTO v_r1 FROM public.submit_guest_order_atomic(v_line_uid, v_key, v_order, v_items);
  IF v_r1.deduplicated THEN RAISE EXCEPTION 'expected deduplicated=false on first call'; END IF;
  SELECT count(*) INTO v_item_cnt FROM public.order_items WHERE order_id = v_r1.order_id;
  IF v_item_cnt <> 2 THEN RAISE EXCEPTION 'expected 2 items, got %', v_item_cnt; END IF;
  SELECT count(*) INTO v_evt_cnt FROM public.order_status_events WHERE order_id = v_r1.order_id;
  IF v_evt_cnt <> 1 THEN RAISE EXCEPTION 'expected 1 status event, got %', v_evt_cnt; END IF;

  --------------------------------------------------------------------
  -- Case 2: same key returns the same order (dedupe), no new rows.
  --------------------------------------------------------------------
  v_order2 := v_order || jsonb_build_object('order_no', 'SO-TEST-DUP-' || substr(v_line_uid, 2, 6),
                                            'line_link_token', 'tok_dup_' || substr(v_line_uid, 2, 6));
  SELECT * INTO v_r2 FROM public.submit_guest_order_atomic(v_line_uid, v_key, v_order2, v_items);
  IF NOT v_r2.deduplicated THEN RAISE EXCEPTION 'expected deduplicated=true on second call'; END IF;
  IF v_r2.order_id <> v_r1.order_id THEN RAISE EXCEPTION 'expected same order_id, r1=% r2=%', v_r1.order_id, v_r2.order_id; END IF;
  SELECT count(*) INTO v_cnt FROM public.orders WHERE line_user_id = v_line_uid AND idempotency_key = v_key;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'expected 1 order row for (uid,key), got %', v_cnt; END IF;
  SELECT count(*) INTO v_item_cnt FROM public.order_items WHERE order_id = v_r1.order_id;
  IF v_item_cnt <> 2 THEN RAISE EXCEPTION 'expected still 2 items after dedupe, got %', v_item_cnt; END IF;

  --------------------------------------------------------------------
  -- Case 3: bad item (missing product_name = NOT NULL) rolls back the whole
  -- insert — no order, no items appear for a fresh idempotency key.
  --------------------------------------------------------------------
  DECLARE
    v_key2 text := 'idem_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
    v_bad  jsonb := jsonb_build_array(jsonb_build_object('qty', 1, 'price', 10, 'total', 10));
    v_ord3 jsonb := v_order || jsonb_build_object(
      'order_no', 'SO-TEST-BAD-' || substr(v_line_uid, 2, 6),
      'line_link_token', 'tok_bad_' || substr(v_line_uid, 2, 6));
  BEGIN
    BEGIN
      PERFORM public.submit_guest_order_atomic(v_line_uid, v_key2, v_ord3, v_bad);
    EXCEPTION WHEN OTHERS THEN
      v_err_hit := true;
    END;
    IF NOT v_err_hit THEN RAISE EXCEPTION 'expected exception on bad item insert'; END IF;
    SELECT count(*) INTO v_cnt FROM public.orders WHERE line_user_id = v_line_uid AND idempotency_key = v_key2;
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'rollback failed: found % orders for bad key', v_cnt; END IF;
  END;

  --------------------------------------------------------------------
  -- Case 4: missing key raises.
  --------------------------------------------------------------------
  v_err_hit := false;
  BEGIN
    PERFORM public.submit_guest_order_atomic(v_line_uid, '', v_order, v_items);
  EXCEPTION WHEN OTHERS THEN v_err_hit := true;
  END;
  IF NOT v_err_hit THEN RAISE EXCEPTION 'expected exception when idempotency key missing'; END IF;

  --------------------------------------------------------------------
  -- Case 5: missing line_user_id raises.
  --------------------------------------------------------------------
  v_err_hit := false;
  BEGIN
    PERFORM public.submit_guest_order_atomic('', v_key, v_order, v_items);
  EXCEPTION WHEN OTHERS THEN v_err_hit := true;
  END;
  IF NOT v_err_hit THEN RAISE EXCEPTION 'expected exception when line_user_id missing'; END IF;

  --------------------------------------------------------------------
  -- Case 6: race — a competing insert lands the (uid,key) row BEFORE our
  -- RPC's own INSERT. The RPC must catch unique_violation and return that
  -- existing order rather than raise.
  --------------------------------------------------------------------
  DECLARE
    v_key3 text := 'idem_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
    v_pre  uuid;
    v_r3   record;
    v_ord4 jsonb := v_order || jsonb_build_object(
      'order_no', 'SO-TEST-RACE-A-' || substr(v_line_uid, 2, 6),
      'line_link_token', 'tok_race_a_' || substr(v_line_uid, 2, 6));
    v_ord5 jsonb := v_order || jsonb_build_object(
      'order_no', 'SO-TEST-RACE-B-' || substr(v_line_uid, 2, 6),
      'line_link_token', 'tok_race_b_' || substr(v_line_uid, 2, 6));
  BEGIN
    -- Winning inserter
    SELECT (public.submit_guest_order_atomic(v_line_uid, v_key3, v_ord4, v_items)).order_id INTO v_pre;
    -- Racing inserter, different order_no + token, same (uid,key)
    SELECT * INTO v_r3 FROM public.submit_guest_order_atomic(v_line_uid, v_key3, v_ord5, v_items);
    IF NOT v_r3.deduplicated THEN RAISE EXCEPTION 'race path: expected deduplicated=true'; END IF;
    IF v_r3.order_id <> v_pre THEN RAISE EXCEPTION 'race path: expected same order_id'; END IF;
    SELECT count(*) INTO v_cnt FROM public.orders WHERE line_user_id = v_line_uid AND idempotency_key = v_key3;
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'race path: expected 1 order, got %', v_cnt; END IF;
  END;

  RAISE NOTICE 'OK submit_guest_order_atomic: order=% deduplicated_second=% items=% events=%',
               v_r1.order_id, v_r2.deduplicated, 2, 1;
END;
$$;

-- Grant sanity: PUBLIC/anon/authenticated must NOT be able to execute.
DO $$
DECLARE
  v_has boolean;
BEGIN
  SELECT has_function_privilege('anon',
    'public.submit_guest_order_atomic(text,text,jsonb,jsonb)', 'EXECUTE') INTO v_has;
  IF v_has THEN RAISE EXCEPTION 'anon must NOT have EXECUTE on submit_guest_order_atomic'; END IF;
  SELECT has_function_privilege('authenticated',
    'public.submit_guest_order_atomic(text,text,jsonb,jsonb)', 'EXECUTE') INTO v_has;
  IF v_has THEN RAISE EXCEPTION 'authenticated must NOT have EXECUTE on submit_guest_order_atomic'; END IF;
  SELECT has_function_privilege('service_role',
    'public.submit_guest_order_atomic(text,text,jsonb,jsonb)', 'EXECUTE') INTO v_has;
  IF NOT v_has THEN RAISE EXCEPTION 'service_role MUST have EXECUTE on submit_guest_order_atomic'; END IF;
  RAISE NOTICE 'OK submit_guest_order_atomic grants: only service_role';
END;
$$;

ROLLBACK;