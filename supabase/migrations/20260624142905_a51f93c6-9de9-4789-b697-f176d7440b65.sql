
-- ============ A. PRODUCTS sync ============
CREATE OR REPLACE FUNCTION public.trg_products_sync_to_rds()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; v_cat uuid; v_cat_name text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.code IS NULL OR length(btrim(NEW.code)) = 0 THEN RETURN NEW; END IF;
  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO v_cat_name FROM public.categories WHERE id = NEW.category_id;
  END IF;
  FOR s IN SELECT id FROM public.rds_stores LOOP
    v_cat := NULL;
    IF v_cat_name IS NOT NULL THEN
      SELECT id INTO v_cat FROM public.rds_categories WHERE store_id = s.id AND name = v_cat_name LIMIT 1;
      IF v_cat IS NULL THEN
        INSERT INTO public.rds_categories(store_id, name) VALUES (s.id, v_cat_name) RETURNING id INTO v_cat;
      END IF;
    END IF;
    INSERT INTO public.rds_products(store_id, category_id, name, sku, price, unit, image_url, stock_qty, is_active)
    VALUES (s.id, v_cat, NEW.name, NEW.code, COALESCE(NEW.standard_price, 0), NEW.unit, NEW.image_url,
            COALESCE(NEW.stock, 0), COALESCE(NEW.active, true))
    ON CONFLICT (store_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      category_id = COALESCE(EXCLUDED.category_id, public.rds_products.category_id),
      price = EXCLUDED.price,
      unit = EXCLUDED.unit,
      image_url = EXCLUDED.image_url,
      is_active = EXCLUDED.is_active,
      updated_at = now();
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_rds_products_sync_to_admin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_existing_id uuid; v_cat_admin uuid; v_cat_name text;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.sku IS NULL OR length(btrim(NEW.sku)) = 0 THEN RETURN NEW; END IF;
  SELECT id INTO v_existing_id FROM public.products WHERE code = NEW.sku LIMIT 1;
  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO v_cat_name FROM public.rds_categories WHERE id = NEW.category_id;
    IF v_cat_name IS NOT NULL THEN
      SELECT id INTO v_cat_admin FROM public.categories WHERE name = v_cat_name LIMIT 1;
      IF v_cat_admin IS NULL THEN
        INSERT INTO public.categories(name) VALUES (v_cat_name) RETURNING id INTO v_cat_admin;
      END IF;
    END IF;
  END IF;
  IF v_existing_id IS NULL THEN
    INSERT INTO public.products(code, name, unit, category_id, image_url, stock, standard_price, active, status, description)
    VALUES (NEW.sku, NEW.name, COALESCE(NEW.unit,'ชิ้น'), v_cat_admin, NEW.image_url,
            COALESCE(NEW.stock_qty,0), COALESCE(NEW.price,0), COALESCE(NEW.is_active,true),
            'draft'::product_status, NEW.description);
  ELSE
    UPDATE public.products SET
      name = NEW.name,
      unit = COALESCE(NEW.unit, unit),
      image_url = COALESCE(NEW.image_url, image_url),
      category_id = COALESCE(v_cat_admin, category_id),
      standard_price = CASE WHEN COALESCE(standard_price,0)=0 AND COALESCE(NEW.price,0)>0 THEN NEW.price ELSE standard_price END,
      updated_at = now()
    WHERE id = v_existing_id;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_organizations_sync_to_rds()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; v_updated int;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.name IS NULL OR length(btrim(NEW.name)) = 0 THEN RETURN NEW; END IF;
  FOR s IN SELECT id FROM public.rds_stores LOOP
    UPDATE public.rds_customers SET
      name = NEW.name,
      phone = COALESCE(NULLIF(NEW.phone,''), phone),
      email = COALESCE(NULLIF(NEW.email,''), email),
      address = COALESCE(NULLIF(NEW.address,''), address),
      updated_at = now()
    WHERE store_id = s.id AND org_id = NEW.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO public.rds_customers(store_id, org_id, name, phone, email, address)
      VALUES (s.id, NEW.id, NEW.name,
              NULLIF(NEW.phone,''), NULLIF(NEW.email,''), NULLIF(NEW.address,''));
    END IF;
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trg_rds_customers_sync_to_admin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_org_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.name IS NULL OR length(btrim(NEW.name)) = 0 THEN RETURN NEW; END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations
      WHERE name = NEW.name AND COALESCE(phone,'') = COALESCE(NEW.phone,'')
      LIMIT 1;
    IF v_org_id IS NULL THEN
      INSERT INTO public.organizations(name, type, contact_name, phone, email, address, approved)
      VALUES (NEW.name, 'general'::customer_type, NEW.name,
              COALESCE(NEW.phone,''), COALESCE(NEW.email,''), COALESCE(NEW.address,''), false)
      RETURNING id INTO v_org_id;
    END IF;
    UPDATE public.rds_customers SET org_id = v_org_id WHERE id = NEW.id;
  ELSE
    UPDATE public.organizations SET
      name = NEW.name,
      phone = COALESCE(NEW.phone, phone),
      email = COALESCE(NEW.email, email),
      address = COALESCE(NEW.address, address),
      updated_at = now()
    WHERE id = NEW.org_id;
  END IF;
  RETURN NEW;
END $function$;

-- Add org_id (no index yet — index created at end after backfill dedupe)
ALTER TABLE public.rds_customers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ============ BACKFILL (triggers NOT installed yet) ============

-- 1) Create organizations for rds_customers that have no matching org
WITH distinct_rc AS (
  SELECT DISTINCT ON (lower(btrim(name)), COALESCE(phone,''))
    name, phone, email, address
  FROM public.rds_customers
  WHERE org_id IS NULL
  ORDER BY lower(btrim(name)), COALESCE(phone,''), created_at ASC
)
INSERT INTO public.organizations(name, type, contact_name, phone, email, address, approved)
SELECT d.name, 'general'::customer_type, d.name,
       COALESCE(d.phone,''), COALESCE(d.email,''), COALESCE(d.address,''), false
FROM distinct_rc d
LEFT JOIN public.organizations o
  ON o.name = d.name AND COALESCE(o.phone,'') = COALESCE(d.phone,'')
WHERE o.id IS NULL;

-- 2) Link existing rds_customers to organizations
UPDATE public.rds_customers rc
   SET org_id = o.id
  FROM public.organizations o
 WHERE rc.org_id IS NULL
   AND rc.name = o.name
   AND COALESCE(rc.phone,'') = COALESCE(o.phone,'');

-- 3) Dedupe: if multiple rds_customers in same store now share same org_id,
--    keep the oldest, repoint document references to it, then delete the rest.
WITH ranked AS (
  SELECT id, store_id, org_id,
         row_number() OVER (PARTITION BY store_id, org_id ORDER BY created_at, id) AS rn
  FROM public.rds_customers
  WHERE org_id IS NOT NULL
),
keepers AS (SELECT store_id, org_id, id AS keep_id FROM ranked WHERE rn = 1),
losers AS (SELECT id, store_id, org_id FROM ranked WHERE rn > 1)
UPDATE public.rds_documents d
   SET customer_id = k.keep_id
  FROM losers l
  JOIN keepers k ON k.store_id = l.store_id AND k.org_id = l.org_id
 WHERE d.customer_id = l.id;

DELETE FROM public.rds_customers
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY store_id, org_id ORDER BY created_at, id) AS rn
     FROM public.rds_customers WHERE org_id IS NOT NULL
   ) x WHERE rn > 1
 );

-- 4) Create the unique index (now safe)
CREATE UNIQUE INDEX IF NOT EXISTS rds_customers_store_org_uk
  ON public.rds_customers(store_id, org_id) WHERE org_id IS NOT NULL;

-- 5) Replicate every org into every store's rds_customers (missing only)
INSERT INTO public.rds_customers(store_id, org_id, name, phone, email, address)
SELECT s.id, o.id, o.name,
       NULLIF(o.phone,''), NULLIF(o.email,''), NULLIF(o.address,'')
FROM public.organizations o
CROSS JOIN public.rds_stores s
WHERE NOT EXISTS (
  SELECT 1 FROM public.rds_customers rc
   WHERE rc.store_id = s.id AND rc.org_id = o.id
);

-- 6) Backfill admin products from rds_products (only new sku)
INSERT INTO public.products(code, name, unit, image_url, stock, standard_price, active, status)
SELECT DISTINCT ON (rp.sku)
  rp.sku, rp.name, COALESCE(rp.unit,'ชิ้น'), rp.image_url,
  COALESCE(rp.stock_qty,0), COALESCE(rp.price,0),
  COALESCE(rp.is_active,true), 'draft'::product_status
FROM public.rds_products rp
LEFT JOIN public.products p ON p.code = rp.sku
WHERE p.id IS NULL AND rp.sku IS NOT NULL AND length(btrim(rp.sku)) > 0
ORDER BY rp.sku, rp.created_at ASC;

-- ============ Install triggers AFTER backfill ============
DROP TRIGGER IF EXISTS rds_products_sync_to_admin ON public.rds_products;
CREATE TRIGGER rds_products_sync_to_admin
AFTER INSERT OR UPDATE ON public.rds_products
FOR EACH ROW EXECUTE FUNCTION public.trg_rds_products_sync_to_admin();

DROP TRIGGER IF EXISTS organizations_sync_to_rds ON public.organizations;
CREATE TRIGGER organizations_sync_to_rds
AFTER INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.trg_organizations_sync_to_rds();

DROP TRIGGER IF EXISTS rds_customers_sync_to_admin ON public.rds_customers;
CREATE TRIGGER rds_customers_sync_to_admin
AFTER INSERT OR UPDATE ON public.rds_customers
FOR EACH ROW EXECUTE FUNCTION public.trg_rds_customers_sync_to_admin();
