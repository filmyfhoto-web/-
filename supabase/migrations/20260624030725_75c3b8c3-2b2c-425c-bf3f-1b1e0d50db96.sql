
CREATE TABLE IF NOT EXISTS public.rds_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  header_text text DEFAULT '',
  footer_text text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_rds_doc_tpl_store ON public.rds_document_templates(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_document_templates TO authenticated;
GRANT ALL ON public.rds_document_templates TO service_role;

ALTER TABLE public.rds_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage doc templates"
  ON public.rds_document_templates FOR ALL
  TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE TRIGGER trg_rds_doc_tpl_updated_at
  BEFORE UPDATE ON public.rds_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
