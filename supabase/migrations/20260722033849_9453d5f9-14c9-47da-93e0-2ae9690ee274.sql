
ALTER TABLE public.film_customers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_film_customers_updated_at ON public.film_customers;
CREATE TRIGGER update_film_customers_updated_at
  BEFORE UPDATE ON public.film_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS film_customers_line_user_id_uk
  ON public.film_customers(line_user_id) WHERE line_user_id IS NOT NULL;

ALTER TABLE public.rds_customers
  ADD COLUMN IF NOT EXISTS line_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS rds_customers_line_user_id_uk
  ON public.rds_customers(line_user_id) WHERE line_user_id IS NOT NULL;

DROP VIEW IF EXISTS public.v_unified_customers;
CREATE VIEW public.v_unified_customers
WITH (security_invoker = on) AS
  SELECT
    'profile'::text AS source,
    p.id::text AS source_id,
    COALESCE(p.full_name, p.line_display_name, '') AS name,
    p.phone,
    p.email,
    p.address,
    p.line_display_name,
    lal.line_user_id,
    NULL::uuid AS store_id,
    p.created_at,
    p.created_at AS updated_at
  FROM public.profiles p
  LEFT JOIN public.line_account_links lal
    ON lal.customer_source = 'profile' AND lal.customer_id = p.id
  UNION ALL
  SELECT 'guest', g.id::text, COALESCE(g.name,''), g.phone, NULL, g.address, NULL,
         NULL, NULL::uuid, g.created_at, g.created_at
  FROM public.guest_customers g
  UNION ALL
  SELECT 'film', f.id::text, COALESCE(f.name,''), f.phone, f.email, f.address, NULL,
         f.line_user_id, NULL::uuid, f.created_at, f.updated_at
  FROM public.film_customers f
  UNION ALL
  SELECT 'rds', r.id::text, COALESCE(r.name,''), r.phone, r.email, r.address, NULL,
         r.line_user_id, r.store_id, r.created_at, r.updated_at
  FROM public.rds_customers r;

GRANT SELECT ON public.v_unified_customers TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_unified_customer(
  p_source text,
  p_name text,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_line_user_id text DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_tax_branch text DEFAULT NULL,
  p_existing_id uuid DEFAULT NULL
)
RETURNS TABLE(source text, source_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_staff_any(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_line_user_id IS NOT NULL AND p_line_user_id <> '' THEN
    UPDATE public.film_customers
       SET name = COALESCE(NULLIF(name,''), p_name),
           phone = COALESCE(phone, p_phone),
           email = COALESCE(email, p_email),
           address = COALESCE(address, p_address)
     WHERE line_user_id = p_line_user_id;
    UPDATE public.rds_customers
       SET name = COALESCE(NULLIF(name,''), p_name),
           phone = COALESCE(phone, p_phone),
           email = COALESCE(email, p_email),
           address = COALESCE(address, p_address)
     WHERE line_user_id = p_line_user_id;
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
    IF p_existing_id IS NOT NULL THEN
      UPDATE public.rds_customers
         SET name=p_name, phone=p_phone, email=p_email, address=p_address,
             tax_id=p_tax_id, branch_name=p_tax_branch,
             line_user_id=NULLIF(p_line_user_id,'')
       WHERE id = p_existing_id
       RETURNING id INTO v_id;
    ELSE
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
$$;

REVOKE ALL ON FUNCTION public.upsert_unified_customer(text,text,text,text,text,text,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_unified_customer(text,text,text,text,text,text,uuid,text,text,uuid) TO authenticated;
