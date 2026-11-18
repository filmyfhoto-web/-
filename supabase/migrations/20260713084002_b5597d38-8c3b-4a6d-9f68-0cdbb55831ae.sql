
-- 1. Drop nw_* tables (CASCADE handles FK inside the family)
DROP TABLE IF EXISTS public.nw_work_order_attachments CASCADE;
DROP TABLE IF EXISTS public.nw_work_order_items CASCADE;
DROP TABLE IF EXISTS public.nw_status_history CASCADE;
DROP TABLE IF EXISTS public.nw_activity CASCADE;
DROP TABLE IF EXISTS public.nw_customer_updates CASCADE;
DROP TABLE IF EXISTS public.nw_customer_price_rules CASCADE;
DROP TABLE IF EXISTS public.nw_line_test_recipients CASCADE;
DROP TABLE IF EXISTS public.nw_line_webhook_events CASCADE;
DROP TABLE IF EXISTS public.nw_price_templates CASCADE;
DROP TABLE IF EXISTS public.nw_measurement_units CASCADE;
DROP TABLE IF EXISTS public.nw_job_categories CASCADE;
DROP TABLE IF EXISTS public.nw_settings CASCADE;
DROP TABLE IF EXISTS public.nw_work_orders CASCADE;

-- 2. Delete rds_* rows tied to the nattaworks store
DELETE FROM public.rds_document_items
 WHERE document_id IN (
   SELECT d.id FROM public.rds_documents d
   JOIN public.rds_stores s ON s.id = d.store_id
   WHERE s.slug = 'nattaworks'
 );
DELETE FROM public.rds_document_revisions
 WHERE document_id IN (
   SELECT d.id FROM public.rds_documents d
   JOIN public.rds_stores s ON s.id = d.store_id
   WHERE s.slug = 'nattaworks'
 );
DELETE FROM public.rds_payments
 WHERE document_id IN (
   SELECT d.id FROM public.rds_documents d
   JOIN public.rds_stores s ON s.id = d.store_id
   WHERE s.slug = 'nattaworks'
 );
DELETE FROM public.rds_documents
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_products
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_customers
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_categories
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_payment_methods
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_document_settings
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_drafts
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_activity_logs
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.staff_stores
 WHERE store_id IN (SELECT id FROM public.rds_stores WHERE slug = 'nattaworks');
DELETE FROM public.rds_stores WHERE slug = 'nattaworks';

-- 3. Drop nw_* functions
DROP FUNCTION IF EXISTS public.nw_has_store_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.nw_has_store_access(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.nw_next_doc_no(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.nw_next_doc_no(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.nw_next_doc_no_system(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.nw_next_doc_no_system(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_n_public(uuid) CASCADE;
