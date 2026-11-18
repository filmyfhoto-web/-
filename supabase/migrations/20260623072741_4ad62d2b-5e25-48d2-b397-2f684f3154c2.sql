
ALTER TABLE public.rds_documents ADD COLUMN IF NOT EXISTS google_drive_sync_status text;
ALTER TABLE public.rds_documents ADD COLUMN IF NOT EXISTS google_sheet_synced_at timestamptz;
ALTER TABLE public.rds_documents ADD COLUMN IF NOT EXISTS google_drive_synced_at timestamptz;

-- Stock movement trigger function
CREATE OR REPLACE FUNCTION public.rds_apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_type text;
  v_deleted timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
    SELECT document_type, deleted_at INTO v_doc_type, v_deleted FROM public.rds_documents WHERE id = NEW.document_id;
    IF v_deleted IS NOT NULL THEN RETURN NEW; END IF;
    IF v_doc_type IN ('receipt','delivery','tax_invoice') THEN
      UPDATE public.rds_products
         SET stock_qty = COALESCE(stock_qty,0) - NEW.quantity
       WHERE id = NEW.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NULL THEN RETURN OLD; END IF;
    SELECT document_type INTO v_doc_type FROM public.rds_documents WHERE id = OLD.document_id;
    IF v_doc_type IN ('receipt','delivery','tax_invoice') THEN
      UPDATE public.rds_products
         SET stock_qty = COALESCE(stock_qty,0) + OLD.quantity
       WHERE id = OLD.product_id AND stock_qty IS NOT NULL;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS rds_document_items_stock ON public.rds_document_items;
CREATE TRIGGER rds_document_items_stock
AFTER INSERT OR DELETE ON public.rds_document_items
FOR EACH ROW EXECUTE FUNCTION public.rds_apply_stock_movement();

-- Soft delete + restore
CREATE OR REPLACE FUNCTION public.rds_soft_delete_documents(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.rds_documents
     SET deleted_at = now(), status = 'trash', updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.rds_restore_documents(p_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT is_staff_any(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.rds_documents
     SET deleted_at = NULL, status = 'issued', updated_at = now()
   WHERE id = ANY(p_ids) AND deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_products;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rds_documents;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
