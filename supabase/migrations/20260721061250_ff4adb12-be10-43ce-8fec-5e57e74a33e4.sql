
-- 1) Extend product_variants for Stage 1
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS cost_override numeric,
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_cost_override_check;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_cost_override_check
    CHECK (cost_override IS NULL OR cost_override >= 0);

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_low_stock_threshold_check;
ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_low_stock_threshold_check
    CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);

-- 2) product_attributes (reusable, shared across products)
CREATE TABLE IF NOT EXISTS public.product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label_th text NOT NULL,
  values jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_builtin boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attributes TO authenticated;
GRANT ALL ON public.product_attributes TO service_role;

ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attr staff read" ON public.product_attributes;
CREATE POLICY "attr staff read"
  ON public.product_attributes FOR SELECT
  TO authenticated
  USING (public.is_staff_any(auth.uid()));

DROP POLICY IF EXISTS "attr editor write" ON public.product_attributes;
CREATE POLICY "attr editor write"
  ON public.product_attributes FOR ALL
  TO authenticated
  USING (public.can_edit_product(auth.uid()))
  WITH CHECK (public.can_edit_product(auth.uid()));

DROP TRIGGER IF EXISTS product_attributes_touch ON public.product_attributes;
CREATE TRIGGER product_attributes_touch
  BEFORE UPDATE ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Seed built-ins (idempotent)
INSERT INTO public.product_attributes (key, label_th, values, is_builtin, sort_order) VALUES
  ('color','สี','[]'::jsonb,true,1),
  ('size','ขนาด','[]'::jsonb,true,2),
  ('weight','น้ำหนัก','[]'::jsonb,true,3),
  ('width','ความกว้าง','[]'::jsonb,true,4),
  ('length','ความยาว','[]'::jsonb,true,5),
  ('height','ความสูง','[]'::jsonb,true,6),
  ('flavor','รสชาติ','[]'::jsonb,true,7),
  ('brand','ยี่ห้อ','[]'::jsonb,true,8),
  ('model','รุ่น','[]'::jsonb,true,9),
  ('pattern','ลวดลาย','[]'::jsonb,true,10),
  ('year','ปี','[]'::jsonb,true,11),
  ('condition','สภาพ','[]'::jsonb,true,12)
ON CONFLICT (key) DO NOTHING;

-- 3) enable_product_variants: atomic parent → variants conversion
CREATE OR REPLACE FUNCTION public.enable_product_variants(
  _product_id uuid,
  _allocations jsonb  -- [{sku, name, barcode, attributes, price, cost_override, stock, low_stock_threshold, active, image_url}]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_stock numeric;
  v_sum numeric := 0;
  v_row jsonb;
  v_count int := 0;
BEGIN
  IF NOT public.can_edit_product(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF _allocations IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'allocations required';
  END IF;

  SELECT stock INTO v_parent_stock FROM public.products WHERE id = _product_id FOR UPDATE;
  IF v_parent_stock IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    v_sum := v_sum + COALESCE((v_row->>'stock')::numeric, 0);
  END LOOP;

  IF v_parent_stock > 0 AND v_sum <> v_parent_stock THEN
    RAISE EXCEPTION 'variant stock total (%) must equal parent stock (%)', v_sum, v_parent_stock;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    INSERT INTO public.product_variants(
      product_id, sku, name, barcode, attributes, price, cost_override,
      stock, low_stock_threshold, active, image_url
    ) VALUES (
      _product_id,
      NULLIF(v_row->>'sku',''),
      NULLIF(v_row->>'name',''),
      NULLIF(v_row->>'barcode',''),
      COALESCE(v_row->'attributes','{}'::jsonb),
      NULLIF(v_row->>'price','')::numeric,
      NULLIF(v_row->>'cost_override','')::numeric,
      COALESCE((v_row->>'stock')::numeric, 0),
      NULLIF(v_row->>'low_stock_threshold','')::numeric,
      COALESCE((v_row->>'active')::boolean, true),
      NULLIF(v_row->>'image_url','')
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.products
     SET has_variants = true,
         stock = 0,
         updated_at = now()
   WHERE id = _product_id;

  RETURN jsonb_build_object('ok', true, 'variants_created', v_count, 'parent_stock_before', v_parent_stock);
END;
$$;

REVOKE ALL ON FUNCTION public.enable_product_variants(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.enable_product_variants(uuid, jsonb) TO authenticated;

-- 4) disable_product_variants: atomic roll-up + archive
CREATE OR REPLACE FUNCTION public.disable_product_variants(
  _product_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric := 0;
  v_archived int := 0;
BEGIN
  IF NOT public.can_edit_product(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(stock),0) INTO v_sum
    FROM public.product_variants
    WHERE product_id = _product_id AND active = true AND archived_at IS NULL;

  UPDATE public.product_variants
     SET active = false,
         archived_at = now()
   WHERE product_id = _product_id AND archived_at IS NULL;
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  UPDATE public.products
     SET has_variants = false,
         stock = v_sum,
         updated_at = now()
   WHERE id = _product_id;

  RETURN jsonb_build_object('ok', true, 'variants_archived', v_archived, 'parent_stock_after', v_sum);
END;
$$;

REVOKE ALL ON FUNCTION public.disable_product_variants(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.disable_product_variants(uuid) TO authenticated;
