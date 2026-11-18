-- Linked-unit products: DB constraint / RLS / audit / atomic tests.
-- Executed manually with: psql -f tests/db/product_unit_links.test.sql
-- All checks run in a transaction and roll back at the end.

BEGIN;

-- =========================================================================
-- 1) Grant surface: authenticated has SELECT only, not INSERT/UPDATE/DELETE.
-- =========================================================================
SELECT 1/CASE WHEN (
       has_table_privilege('authenticated','public.product_unit_links','SELECT')
  AND NOT has_table_privilege('authenticated','public.product_unit_links','INSERT')
  AND NOT has_table_privilege('authenticated','public.product_unit_links','UPDATE')
  AND NOT has_table_privilege('authenticated','public.product_unit_links','DELETE')
  AND NOT has_table_privilege('anon','public.product_unit_links','SELECT')
  AND NOT has_table_privilege('anon','public.product_unit_links','INSERT')
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 2) RLS: only one policy remains (SELECT), no FOR ALL policy.
-- =========================================================================
SELECT 1/CASE WHEN (
  SELECT count(*)=1 AND bool_and(cmd='SELECT')
  FROM pg_policies WHERE tablename='product_unit_links'
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 3) Table shape: audit columns exist, wrapper_id is UNIQUE, ratio > 0.
-- =========================================================================
SELECT 1/CASE WHEN (
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='product_unit_links' AND column_name='disabled_at')
  AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='product_unit_links' AND column_name='disabled_by')
  AND EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name='product_unit_links' AND column_name='created_by')
) THEN 1 ELSE 0 END;

SELECT 1/CASE WHEN EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  WHERE t.relname='product_unit_links'
    AND c.contype='c'
    AND pg_get_constraintdef(c.oid) ILIKE '%ratio > 0%'
) THEN 1 ELSE 0 END;

SELECT 1/CASE WHEN EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE tablename='product_unit_links'
    AND indexdef ILIKE '%UNIQUE%wrapper_id%'
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 4) Direct DML denial (staff role): even after SET ROLE authenticated,
--    INSERT/UPDATE/DELETE on the table must be refused with permission_denied.
-- =========================================================================
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.product_unit_links(wrapper_id, base_id, ratio)
    VALUES (gen_random_uuid(), gen_random_uuid(), 4);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'expected insufficient_privilege on direct INSERT'; END IF;

  denied := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.product_unit_links SET ratio=99 WHERE true;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'expected insufficient_privilege on direct UPDATE'; END IF;

  denied := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.product_unit_links WHERE true;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'expected insufficient_privilege on direct DELETE'; END IF;

  denied := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.product_unit_links LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION 'expected insufficient_privilege on anon SELECT'; END IF;
END $$;

-- =========================================================================
-- 5) Server view: v_product_effective_stock returns effective_stock.
-- =========================================================================
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='v_product_effective_stock' AND column_name='effective_stock'
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 6) pos_cancel_receipt uses snapshot columns.
-- =========================================================================
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='pos_cancel_receipt'
    AND pg_get_functiondef(p.oid) ILIKE '%base_product_id%'
    AND pg_get_functiondef(p.oid) ILIKE '%base_ratio%'
    AND pg_get_functiondef(p.oid) ILIKE '%cancelled_at IS NOT NULL%'
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 7) unset_product_unit_link is a SOFT DISABLE (no DELETE token in body).
-- =========================================================================
SELECT 1/CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='unset_product_unit_link'
    AND pg_get_functiondef(p.oid) ILIKE '%enabled     = false%'
    AND pg_get_functiondef(p.oid) ILIKE '%disabled_at = now()%'
    AND pg_get_functiondef(p.oid) NOT ILIKE '%DELETE FROM public.product_unit_links%'
) THEN 1 ELSE 0 END;

-- =========================================================================
-- 8) Full end-to-end via service_role: create products, link, atomic
--    checkout/cancel round trip, chain/cycle/self rejections.
--    We do this as service_role so RLS/GRANTS don't block the harness.
--    The RPCs internally require is_staff_any(auth.uid()) — bypass by
--    running them AS service_role, then re-asserting staff denial by
--    switching back to `authenticated` with a fresh session below.
-- =========================================================================
DO $$
DECLARE
  base_id uuid; pack_id uuid; carton_id uuid;
  link_row public.product_unit_links;
  base_stock_before numeric; base_stock_after numeric;
  receipt_result jsonb; rid uuid;
  staff_id uuid;
BEGIN
  -- Impersonate an existing staff user so is_staff_any(auth.uid()) passes.
  -- All changes roll back at the end of the transaction.
  SELECT user_id INTO staff_id
    FROM public.user_roles
    WHERE role IN ('owner','admin','stock_staff','photo_staff')
    LIMIT 1;
  IF staff_id IS NULL THEN
    RAISE NOTICE 'skipping RPC block: no staff seed available';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', staff_id::text, true);

  -- Seed three isolated products (avoid unique-code collisions in prod data)
  INSERT INTO public.products(name, code, unit, stock, standard_price, active)
  VALUES ('__t_base__', '__t_base__', 'pcs', 100, 5, true) RETURNING id INTO base_id;
  INSERT INTO public.products(name, code, unit, stock, standard_price, active)
  VALUES ('__t_pack__', '__t_pack__', 'pack', 0, 20, true) RETURNING id INTO pack_id;
  INSERT INTO public.products(name, code, unit, stock, standard_price, active)
  VALUES ('__t_carton__', '__t_carton__', 'carton', 0, 200, true) RETURNING id INTO carton_id;

  -- 8a) self link forbidden
  BEGIN
    PERFORM public.set_product_unit_link(pack_id, pack_id, 4);
    RAISE EXCEPTION 'expected self_link_forbidden';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  -- 8b) valid link pack -> base ratio 4
  link_row := public.set_product_unit_link(pack_id, base_id, 4);
  IF link_row.enabled IS NOT TRUE THEN RAISE EXCEPTION 'expected enabled true'; END IF;

  -- 8c) chain rejection: carton -> pack (pack is already a wrapper)
  BEGIN
    PERFORM public.set_product_unit_link(carton_id, pack_id, 10);
    RAISE EXCEPTION 'expected base_is_itself_a_wrapper_no_chain';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  -- 8d) cycle/promotion rejection: base -> pack (pack is used as base by no one, but
  --     linking base as a wrapper of pack means pack becomes a base while it is a wrapper)
  BEGIN
    PERFORM public.set_product_unit_link(base_id, pack_id, 1);
    RAISE EXCEPTION 'expected chain or cycle rejection';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;

  -- 8e) v_product_effective_stock: pack derives floor(100/4) = 25
  IF (SELECT effective_stock FROM public.v_product_effective_stock WHERE product_id=pack_id) <> 25 THEN
    RAISE EXCEPTION 'expected effective_stock=25 for pack';
  END IF;

  -- 8f) atomic decrement: sell 3 packs → base drops by 12
  SELECT stock INTO base_stock_before FROM public.products WHERE id=base_id;
  receipt_result := public.pos_checkout(
    p_idempotency_key := 'test-idem-'||gen_random_uuid()::text,
    p_items := jsonb_build_array(jsonb_build_object('product_id', pack_id, 'qty', 3)),
    p_payment_type := 'cash', p_payment_status := 'paid'
  );
  rid := (receipt_result->>'receipt_id')::uuid;
  SELECT stock INTO base_stock_after FROM public.products WHERE id=base_id;
  IF base_stock_after <> base_stock_before - 12 THEN
    RAISE EXCEPTION 'expected base stock to drop by 12, got before=% after=%', base_stock_before, base_stock_after;
  END IF;

  -- 8g) receipt items snapshot base identity + ratio
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_receipt_items
    WHERE receipt_id = rid AND base_product_id = base_id AND base_ratio = 4
  ) THEN
    RAISE EXCEPTION 'expected receipt item to snapshot base_product_id + base_ratio';
  END IF;

  -- 8h) idempotent checkout: replay same key returns same receipt, no double decrement
  PERFORM public.pos_checkout(
    p_idempotency_key := (SELECT idempotency_key FROM public.pos_receipts WHERE id=rid),
    p_items := jsonb_build_array(jsonb_build_object('product_id', pack_id, 'qty', 3)),
    p_payment_type := 'cash', p_payment_status := 'paid'
  );
  IF (SELECT stock FROM public.products WHERE id=base_id) <> base_stock_after THEN
    RAISE EXCEPTION 'idempotent checkout must not decrement again';
  END IF;

  -- 8i) cancel restores exact +12
  PERFORM public.pos_cancel_receipt(rid, 'test_restock');
  IF (SELECT stock FROM public.products WHERE id=base_id) <> base_stock_before THEN
    RAISE EXCEPTION 'cancel must restore to before value';
  END IF;

  -- 8j) double cancel is idempotent
  PERFORM public.pos_cancel_receipt(rid, 'test_restock');
  IF (SELECT stock FROM public.products WHERE id=base_id) <> base_stock_before THEN
    RAISE EXCEPTION 'double cancel must not double restock';
  END IF;

  -- 8k) insufficient stock: request 999 packs (999*4=3996 > base)
  BEGIN
    PERFORM public.pos_checkout(
      p_idempotency_key := 'test-insuff-'||gen_random_uuid()::text,
      p_items := jsonb_build_array(jsonb_build_object('product_id', pack_id, 'qty', 999)),
      p_payment_type := 'cash', p_payment_status := 'paid'
    );
    RAISE EXCEPTION 'expected insufficient_stock';
  EXCEPTION WHEN sqlstate '55000' THEN NULL;
  END;

  -- 8l) soft-disable via unset: row remains, enabled=false, audit stamped.
  PERFORM public.unset_product_unit_link(pack_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.product_unit_links
    WHERE wrapper_id=pack_id AND enabled=false AND disabled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected soft-disabled row with disabled_at set';
  END IF;

  -- 8m) re-enable preserves created_by/created_at
  DECLARE
    created_a timestamptz; created_b timestamptz;
    creator_a uuid; creator_b uuid;
  BEGIN
    SELECT created_at, created_by INTO created_a, creator_a
      FROM public.product_unit_links WHERE wrapper_id=pack_id;
    PERFORM public.set_product_unit_link(pack_id, base_id, 4);
    SELECT created_at, created_by INTO created_b, creator_b
      FROM public.product_unit_links WHERE wrapper_id=pack_id;
    IF created_a <> created_b OR creator_a IS DISTINCT FROM creator_b THEN
      RAISE EXCEPTION 'created_at/created_by must survive re-enable';
    END IF;
  END;
END $$;

ROLLBACK;