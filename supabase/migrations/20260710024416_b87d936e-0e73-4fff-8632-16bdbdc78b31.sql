
ALTER TABLE public.nw_settings
  ADD COLUMN IF NOT EXISTS hero_banner_url text,
  ADD COLUMN IF NOT EXISTS ui_font_scale text NOT NULL DEFAULT 'M',
  ADD COLUMN IF NOT EXISTS site_url text;

-- Public RPC: fetch minimal work-order data for the print/receipt page by id.
-- Returns header + items in JSON. SECURITY DEFINER so anon (LINE recipients) can open the bill link.
CREATE OR REPLACE FUNCTION public.get_nw_work_order_public(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h_row public.nw_work_orders%ROWTYPE;
  items_json jsonb;
  store_json jsonb;
BEGIN
  SELECT * INTO h_row FROM public.nw_work_orders WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i.*) ORDER BY i.seq), '[]'::jsonb)
    INTO items_json
    FROM public.nw_work_order_items i
    WHERE i.work_order_id = _id;

  SELECT to_jsonb(s.*) INTO store_json
    FROM public.rds_stores s
    WHERE s.id = h_row.store_id;

  RETURN jsonb_build_object(
    'header', jsonb_build_object(
      'id', h_row.id,
      'doc_no', h_row.doc_no,
      'doc_date', h_row.doc_date,
      'due_date', h_row.due_date,
      'status', h_row.status,
      'customer_name_snap', h_row.customer_name_snap,
      'customer_phone_snap', h_row.customer_phone_snap,
      'delivery_address', h_row.delivery_address,
      'job_title', h_row.job_title,
      'note', h_row.note,
      'channel', h_row.channel,
      'grand_total_billed', h_row.grand_total_billed,
      'deposit', h_row.deposit,
      'store_id', h_row.store_id
    ),
    'items', items_json,
    'store', COALESCE(store_json, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nw_work_order_public(uuid) TO anon, authenticated;
