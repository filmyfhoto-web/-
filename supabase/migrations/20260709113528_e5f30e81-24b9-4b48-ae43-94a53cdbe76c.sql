
CREATE OR REPLACE FUNCTION public.nw_next_doc_no_system(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_period text := to_char((now() AT TIME ZONE 'Asia/Bangkok'), 'YYYYMM');
  v_seq int;
BEGIN
  INSERT INTO public.nw_settings(store_id) VALUES (p_store_id)
    ON CONFLICT (store_id) DO NOTHING;
  UPDATE public.nw_settings
     SET doc_no_seq = CASE WHEN doc_no_period = v_period THEN doc_no_seq + 1 ELSE 1 END,
         doc_no_period = v_period,
         updated_at = now()
   WHERE store_id = p_store_id
  RETURNING doc_no_seq, doc_no_prefix INTO v_seq, v_prefix;
  RETURN v_prefix || '-' || v_period || '-' || lpad(v_seq::text, 4, '0');
END
$$;

REVOKE ALL ON FUNCTION public.nw_next_doc_no_system(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nw_next_doc_no_system(uuid) TO service_role;
