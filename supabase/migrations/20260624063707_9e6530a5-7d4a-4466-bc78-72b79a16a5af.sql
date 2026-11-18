
CREATE OR REPLACE FUNCTION public.rds_next_doc_no(p_store_id uuid, p_document_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_format text;
  v_seq int;
  v_year text := to_char(now(),'YYYY');
  v_month text := to_char(now(),'MM');
  v_result text;
  v_actual text := p_document_type;
  v_alt text := NULL;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Map delivery <-> delivery_order so either naming works
  IF p_document_type = 'delivery' THEN v_alt := 'delivery_order';
  ELSIF p_document_type = 'delivery_order' THEN v_alt := 'delivery';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rds_document_settings
    WHERE store_id = p_store_id AND document_type = v_actual
  ) AND v_alt IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rds_document_settings
    WHERE store_id = p_store_id AND document_type = v_alt
  ) THEN
    v_actual := v_alt;
  END IF;

  UPDATE public.rds_document_settings
     SET next_number = next_number + 1
   WHERE store_id = p_store_id AND document_type = v_actual
  RETURNING prefix, running_format, next_number - 1 INTO v_prefix, v_format, v_seq;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'document settings not found for % / %', p_store_id, p_document_type;
  END IF;

  v_result := replace(v_format, '{prefix}', v_prefix);
  v_result := replace(v_result, '{yyyy}', v_year);
  v_result := replace(v_result, '{mm}', v_month);
  v_result := regexp_replace(v_result, '\{seq:0+\}', lpad(v_seq::text, length((regexp_match(v_format,'\{seq:(0+)\}'))[1]), '0'));
  v_result := replace(v_result, '{seq}', v_seq::text);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.rds_apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_type text;
  v_deleted timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
    SELECT document_type, deleted_at INTO v_doc_type, v_deleted FROM public.rds_documents WHERE id = NEW.document_id;
    IF v_deleted IS NOT NULL THEN RETURN NEW; END IF;
    IF v_doc_type IN ('receipt','delivery','delivery_order','tax_invoice') THEN
      UPDATE public.rds_products
         SET stock_qty = COALESCE(stock_qty,0) - NEW.quantity
       WHERE id = NEW.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL THEN RETURN OLD; END IF;
    SELECT document_type INTO v_doc_type FROM public.rds_documents WHERE id = OLD.document_id;
    IF v_doc_type IN ('receipt','delivery','delivery_order','tax_invoice') THEN
      UPDATE public.rds_products
         SET stock_qty = COALESCE(stock_qty,0) + OLD.quantity
       WHERE id = OLD.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;
