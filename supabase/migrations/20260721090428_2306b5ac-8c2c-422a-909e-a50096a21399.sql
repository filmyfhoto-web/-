
-- =====================================================================
-- HARDEN product_unit_links: RPC-only mutations, preserve audit trail
-- =====================================================================

-- 1) Add audit columns (idempotent)
ALTER TABLE public.product_unit_links
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid;

-- 2) Revoke direct DML. Only SELECT stays for authenticated (staff-gated by RLS).
REVOKE INSERT, UPDATE, DELETE ON public.product_unit_links FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_unit_links FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_unit_links FROM PUBLIC;
GRANT  SELECT ON public.product_unit_links TO authenticated;
GRANT  ALL    ON public.product_unit_links TO service_role;

-- 3) Drop the too-broad FOR ALL policy; keep the SELECT policy.
DROP POLICY IF EXISTS "Staff manage unit links via RPC only" ON public.product_unit_links;

-- Re-affirm read policy (idempotent). Only staff can see links.
DROP POLICY IF EXISTS "Staff read unit links" ON public.product_unit_links;
CREATE POLICY "Staff read unit links"
  ON public.product_unit_links FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

-- 4) Rewrite set_product_unit_link:
--    - Preserve created_by/created_at on re-enable
--    - Clear disabled_at/disabled_by when re-enabling
--    - Same validation as before (self / chain / promotion / SKU / active)
CREATE OR REPLACE FUNCTION public.set_product_unit_link(
  _wrapper_id uuid, _base_id uuid, _ratio integer
) RETURNS public.product_unit_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w public.products; b public.products;
  used_as_base int; base_is_wrapper int; existing public.product_unit_links;
  out_row public.product_unit_links;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  IF _wrapper_id IS NULL OR _base_id IS NULL THEN
    RAISE EXCEPTION 'wrapper_and_base_required' USING ERRCODE='22023';
  END IF;
  IF _wrapper_id = _base_id THEN
    RAISE EXCEPTION 'self_link_forbidden' USING ERRCODE='22023';
  END IF;
  IF _ratio IS NULL OR _ratio <= 0 THEN
    RAISE EXCEPTION 'ratio_must_be_positive_integer' USING ERRCODE='22023';
  END IF;

  SELECT * INTO w FROM public.products WHERE id=_wrapper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wrapper_not_found' USING ERRCODE='P0002'; END IF;
  IF w.deleted_at IS NOT NULL OR NOT w.active THEN
    RAISE EXCEPTION 'wrapper_inactive' USING ERRCODE='22023';
  END IF;
  IF COALESCE(w.has_variants,false) THEN
    RAISE EXCEPTION 'wrapper_has_variants_conflict' USING ERRCODE='22023';
  END IF;

  SELECT * INTO b FROM public.products WHERE id=_base_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'base_not_found' USING ERRCODE='P0002'; END IF;
  IF b.deleted_at IS NOT NULL OR NOT b.active THEN
    RAISE EXCEPTION 'base_inactive' USING ERRCODE='22023';
  END IF;
  IF COALESCE(b.has_variants,false) THEN
    RAISE EXCEPTION 'base_has_variants_conflict' USING ERRCODE='22023';
  END IF;

  -- No chain: base itself must not currently be an enabled wrapper.
  SELECT count(*) INTO base_is_wrapper FROM public.product_unit_links
    WHERE wrapper_id = _base_id AND enabled = true;
  IF base_is_wrapper > 0 THEN
    RAISE EXCEPTION 'base_is_itself_a_wrapper_no_chain' USING ERRCODE='22023';
  END IF;

  -- No cycle / no promotion: wrapper must not currently be an enabled base of anything.
  SELECT count(*) INTO used_as_base FROM public.product_unit_links
    WHERE base_id = _wrapper_id AND enabled = true;
  IF used_as_base > 0 THEN
    RAISE EXCEPTION 'wrapper_is_already_base_of_other_wrapper' USING ERRCODE='22023';
  END IF;

  SELECT * INTO existing FROM public.product_unit_links WHERE wrapper_id=_wrapper_id;
  IF FOUND THEN
    -- Re-enable / update in place. created_by/created_at stay intact.
    UPDATE public.product_unit_links
      SET base_id     = _base_id,
          ratio       = _ratio,
          enabled     = true,
          disabled_at = NULL,
          disabled_by = NULL,
          updated_at  = now()
      WHERE wrapper_id=_wrapper_id
      RETURNING * INTO out_row;
  ELSE
    INSERT INTO public.product_unit_links(wrapper_id, base_id, ratio, enabled, created_by)
      VALUES (_wrapper_id, _base_id, _ratio, true, auth.uid())
      RETURNING * INTO out_row;
  END IF;
  RETURN out_row;
END; $$;

REVOKE ALL ON FUNCTION public.set_product_unit_link(uuid,uuid,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_product_unit_link(uuid,uuid,integer) TO authenticated;

-- 5) Rewrite unset_product_unit_link: SOFT DISABLE (do not delete audit row)
CREATE OR REPLACE FUNCTION public.unset_product_unit_link(_wrapper_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;
  UPDATE public.product_unit_links
     SET enabled     = false,
         disabled_at = now(),
         disabled_by = auth.uid(),
         updated_at  = now()
   WHERE wrapper_id = _wrapper_id
     AND enabled    = true;
END; $$;

REVOKE ALL ON FUNCTION public.unset_product_unit_link(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unset_product_unit_link(uuid) TO authenticated;
