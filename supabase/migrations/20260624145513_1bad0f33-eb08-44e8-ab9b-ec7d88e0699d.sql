ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS show_payment_method boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_payment_date boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_footer_document_date boolean NOT NULL DEFAULT true;