ALTER TABLE public.rds_documents ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS rds_documents_idempotency_key_uniq
  ON public.rds_documents (store_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;