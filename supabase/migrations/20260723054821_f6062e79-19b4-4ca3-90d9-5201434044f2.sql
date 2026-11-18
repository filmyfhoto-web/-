CREATE OR REPLACE FUNCTION public.upsert_unified_customer(p_source text, p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_line_user_id text DEFAULT NULL::text, p_store_id uuid DEFAULT NULL::uuid, p_tax_id text DEFAULT NULL::text, p_tax_branch text DEFAULT NULL::text, p_existing_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(source text, source_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_existing_store uuid;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Cross-store LINE identity sync: only touch rows in stores the caller staffs.
  IF p_line_user_id IS NOT NULL AND p_line_user_id <> '' THEN
    UPDATE public.film_customers
       SET name = COALESCE(NULLIF(name,''), p_name),
           phone = COALESCE(phone, p_phone),
           email = COALESCE(email, p_email),
           address = COALESCE(address, p_address)
     WHERE line_user_id = p_line_user_id;
    UPDATE public.rds_customers c
       SET name = COALESCE(NULLIF(c.name,''), p_name),
           phone = COALESCE(c.phone, p_phone),
           email = COALESCE(c.email, p_email),
           address = COALESCE(c.address, p_address)
     WHERE c.line_user_id = p_line_user_id
       AND public.is_staff_of_store(auth.uid(), c.store_id);
  END IF;

  IF p_source = 'film' THEN
    IF p_existing_id IS NOT NULL THEN
      UPDATE public.film_customers
         SET name=p_name, phone=p_phone, email=p_email, address=p_address,
             tax_id=p_tax_id, tax_branch=p_tax_branch,
             line_user_id=NULLIF(p_line_user_id,'')
       WHERE id = p_existing_id
       RETURNING id INTO v_id;
    ELSE
      INSERT INTO public.film_customers(name, phone, email, address, tax_id, tax_branch, line_user_id)
      VALUES (p_name, p_phone, p_email, p_address, p_tax_id, p_tax_branch, NULLIF(p_line_user_id,''))
      ON CONFLICT (line_user_id) WHERE line_user_id IS NOT NULL
        DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, email=EXCLUDED.email,
                      address=EXCLUDED.address, tax_id=EXCLUDED.tax_id, tax_branch=EXCLUDED.tax_branch
      RETURNING id INTO v_id;
    END IF;
    RETURN QUERY SELECT 'film'::text, v_id;
  ELSIF p_source = 'rds' THEN
    IF p_store_id IS NULL THEN
      RAISE EXCEPTION 'store_id is required for rds source';
    END IF;
    -- Enforce tenant isolation: caller must staff the target store.
    IF NOT public.is_staff_of_store(auth.uid(), p_store_id) THEN
      RAISE EXCEPTION 'not authorized for store';
    END IF;
    IF p_existing_id IS NOT NULL THEN
      -- Existing row must belong to a store the caller staffs, and to p_store_id.
      SELECT store_id INTO v_existing_store FROM public.rds_customers WHERE id = p_existing_id;
      IF v_existing_store IS NULL THEN
        RAISE EXCEPTION 'customer not found';
      END IF;
      IF v_existing_store <> p_store_id OR NOT public.is_staff_of_store(auth.uid(), v_existing_store) THEN
        RAISE EXCEPTION 'not authorized for target customer';
      END IF;
      UPDATE public.rds_customers
         SET name=p_name, phone=p_phone, email=p_email, address=p_address,
             tax_id=p_tax_id, branch_name=p_tax_branch,
             line_user_id=NULLIF(p_line_user_id,'')
       WHERE id = p_existing_id
       RETURNING id INTO v_id;
    ELSE
      -- Prevent hijacking another store's LINE-bound row via the unique-index upsert.
      IF p_line_user_id IS NOT NULL AND p_line_user_id <> '' THEN
        SELECT store_id INTO v_existing_store
          FROM public.rds_customers
         WHERE line_user_id = p_line_user_id
         LIMIT 1;
        IF v_existing_store IS NOT NULL AND v_existing_store <> p_store_id THEN
          RAISE EXCEPTION 'line identity bound to another store';
        END IF;
      END IF;
      INSERT INTO public.rds_customers(store_id, name, phone, email, address, tax_id, branch_name, line_user_id)
      VALUES (p_store_id, p_name, p_phone, p_email, p_address, p_tax_id, p_tax_branch, NULLIF(p_line_user_id,''))
      ON CONFLICT (line_user_id) WHERE line_user_id IS NOT NULL
        DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, email=EXCLUDED.email,
                      address=EXCLUDED.address, tax_id=EXCLUDED.tax_id, branch_name=EXCLUDED.branch_name
      RETURNING id INTO v_id;
    END IF;
    RETURN QUERY SELECT 'rds'::text, v_id;
  ELSE
    RAISE EXCEPTION 'unsupported source: %', p_source;
  END IF;
END;
$function$;