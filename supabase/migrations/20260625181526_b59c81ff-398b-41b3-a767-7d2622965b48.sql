
-- 1) Backfill next_number based on actual document_no in rds_documents (incl. trash)
WITH parsed AS (
  SELECT
    d.store_id,
    d.document_type,
    MAX(
      NULLIF(regexp_replace(d.document_no, '.*[^0-9]([0-9]+)$', '\1'), '')::int
    ) AS max_seq
  FROM public.rds_documents d
  WHERE d.document_no ~ '[0-9]+$'
  GROUP BY d.store_id, d.document_type
)
UPDATE public.rds_document_settings s
SET next_number = GREATEST(s.next_number, COALESCE(p.max_seq, 0) + 1)
FROM parsed p
WHERE s.store_id = p.store_id
  AND (
    s.document_type = p.document_type
    OR (s.document_type = 'delivery' AND p.document_type = 'delivery_order')
    OR (s.document_type = 'delivery_order' AND p.document_type = 'delivery')
  );

-- 2) Replace rds_next_doc_no with collision-safe version
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
  v_max_existing int;
  v_pad int;
  v_attempts int := 0;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

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

  SELECT prefix, running_format INTO v_prefix, v_format
  FROM public.rds_document_settings
  WHERE store_id = p_store_id AND document_type = v_actual;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'document settings not found for % / %', p_store_id, p_document_type;
  END IF;

  -- Sync against any out-of-band rows (incl. trash) BEFORE allocating
  SELECT COALESCE(MAX(NULLIF(regexp_replace(document_no, '.*[^0-9]([0-9]+)$', '\1'), '')::int), 0)
    INTO v_max_existing
  FROM public.rds_documents
  WHERE store_id = p_store_id
    AND (document_type = v_actual
         OR (v_alt IS NOT NULL AND document_type = v_alt))
    AND document_no ~ '[0-9]+$';

  UPDATE public.rds_document_settings
    SET next_number = GREATEST(next_number, v_max_existing + 1)
    WHERE store_id = p_store_id AND document_type = v_actual;

  -- Allocate with retry to skip any number that already exists
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'rds_next_doc_no: too many collisions for % / %', p_store_id, p_document_type;
    END IF;

    UPDATE public.rds_document_settings
       SET next_number = next_number + 1
     WHERE store_id = p_store_id AND document_type = v_actual
    RETURNING next_number - 1 INTO v_seq;

    v_pad := COALESCE(length((regexp_match(v_format,'\{seq:(0+)\}'))[1]), 0);
    v_result := replace(v_format, '{prefix}', v_prefix);
    v_result := replace(v_result, '{yyyy}', v_year);
    v_result := replace(v_result, '{mm}', v_month);
    IF v_pad > 0 THEN
      v_result := regexp_replace(v_result, '\{seq:0+\}', lpad(v_seq::text, v_pad, '0'));
    END IF;
    v_result := replace(v_result, '{seq}', v_seq::text);

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.rds_documents
      WHERE store_id = p_store_id
        AND (document_type = v_actual
             OR (v_alt IS NOT NULL AND document_type = v_alt))
        AND document_no = v_result
    );
  END LOOP;

  RETURN v_result;
END $function$;
