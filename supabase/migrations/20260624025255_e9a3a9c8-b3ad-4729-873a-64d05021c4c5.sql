
ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS status_workflow text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS related_document_no text,
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'classic';

CREATE TABLE IF NOT EXISTS public.rds_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.rds_documents(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  revision_no int NOT NULL DEFAULT 1,
  action text NOT NULL,
  note text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rds_doc_rev_doc ON public.rds_document_revisions(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rds_doc_rev_store ON public.rds_document_revisions(store_id, created_at DESC);

GRANT SELECT, INSERT ON public.rds_document_revisions TO authenticated;
GRANT ALL ON public.rds_document_revisions TO service_role;

ALTER TABLE public.rds_document_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view doc revisions"
  ON public.rds_document_revisions FOR SELECT
  TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "Staff can insert doc revisions"
  ON public.rds_document_revisions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()));
