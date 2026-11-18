
-- 1) Alter orders to support guest submissions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_id uuid,
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS orders_guest_id_idx ON public.orders(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_guest_phone_idx ON public.orders(guest_phone) WHERE guest_phone IS NOT NULL;

-- 2) Public RPC: resolve org from slug (returns minimal safe fields)
CREATE OR REPLACE FUNCTION public.resolve_org_slug(p_slug text)
RETURNS TABLE(id uuid, name text, approved boolean, price_group_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.approved, o.price_group_id
  FROM public.organizations o
  WHERE o.slug = p_slug
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_org_slug(text) TO anon, authenticated, service_role;

-- 3) Public RPC: prices resolved by explicit org id (no auth required)
CREATE OR REPLACE FUNCTION public.get_prices_by_org(p_org_id uuid, p_product_ids uuid[])
RETURNS TABLE(product_id uuid, price numeric, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_org_id IS NOT NULL THEN
    SELECT price_group_id INTO v_group_id FROM public.organizations WHERE id = p_org_id;
  END IF;

  RETURN QUERY
  SELECT p.id AS product_id,
         COALESCE(cp.price, gp.price, p.price)::numeric AS price,
         CASE
           WHEN cp.price IS NOT NULL THEN 'customer'
           WHEN gp.price IS NOT NULL THEN 'group'
           WHEN p.price IS NOT NULL THEN 'standard'
           ELSE 'pending'
         END AS source
  FROM public.products p
  LEFT JOIN public.customer_prices cp
    ON cp.product_id = p.id AND cp.organization_id = p_org_id
  LEFT JOIN public.group_prices gp
    ON gp.product_id = p.id AND gp.price_group_id = v_group_id
  WHERE p.id = ANY(p_product_ids);
END
$$;

GRANT EXECUTE ON FUNCTION public.get_prices_by_org(uuid, uuid[]) TO anon, authenticated, service_role;

-- 4) Public RPC: fetch guest's own orders (requires matching guest_id + phone)
CREATE OR REPLACE FUNCTION public.get_guest_orders(p_guest_id uuid, p_phone text)
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.orders
  WHERE is_guest = true
    AND guest_id = p_guest_id
    AND guest_phone = p_phone
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 200
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_orders(uuid, text) TO anon, authenticated, service_role;

-- 5) Public RPC: fetch a single guest order detail (with items) — bound by guest_id+phone
CREATE OR REPLACE FUNCTION public.get_guest_order_detail(p_order_id uuid, p_guest_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_org jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders
   WHERE id = p_order_id AND is_guest = true
     AND guest_id = p_guest_id AND guest_phone = p_phone
   LIMIT 1;
  IF v_order.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.created_at), '[]'::jsonb) INTO v_items
    FROM public.order_items i WHERE i.order_id = v_order.id;

  SELECT to_jsonb(o.*) INTO v_org FROM public.organizations o WHERE o.id = v_order.organization_id;

  RETURN jsonb_build_object('order', to_jsonb(v_order), 'items', v_items, 'organization', v_org);
END
$$;

GRANT EXECUTE ON FUNCTION public.get_guest_order_detail(uuid, uuid, text) TO anon, authenticated, service_role;
