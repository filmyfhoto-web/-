
CREATE TABLE public.rds_document_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text,
  base_template text NOT NULL DEFAULT 'modern',
  header_text text,
  footer_text text,
  margins jsonb NOT NULL DEFAULT '{"top":14,"bottom":14,"left":12,"right":12}'::jsonb,
  show_logo boolean NOT NULL DEFAULT true,
  show_tax_id boolean NOT NULL DEFAULT true,
  show_store_address boolean NOT NULL DEFAULT true,
  show_document_no boolean NOT NULL DEFAULT true,
  show_document_date boolean NOT NULL DEFAULT true,
  accent_color text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_document_layouts TO authenticated;
GRANT ALL ON public.rds_document_layouts TO service_role;

ALTER TABLE public.rds_document_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rds_document_layouts staff all"
  ON public.rds_document_layouts
  FOR ALL
  USING (public.is_staff_of_store(auth.uid(), store_id))
  WITH CHECK (public.is_staff_of_store(auth.uid(), store_id));

CREATE UNIQUE INDEX rds_document_layouts_default_per_type
  ON public.rds_document_layouts (store_id, COALESCE(doc_type, ''))
  WHERE is_default = true;

CREATE INDEX rds_document_layouts_store_idx ON public.rds_document_layouts (store_id);

CREATE TRIGGER trg_rds_document_layouts_updated_at
  BEFORE UPDATE ON public.rds_document_layouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rds_documents
  ADD COLUMN IF NOT EXISTS layout_id uuid REFERENCES public.rds_document_layouts(id) ON DELETE SET NULL;

INSERT INTO public.rds_document_layouts (store_id, name, header_text, footer_text, is_default)
SELECT s.store_id, 'มาตรฐาน', s.header_text, s.footer_text, true
FROM (
  SELECT DISTINCT ON (store_id) store_id, header_text, footer_text
  FROM public.rds_document_templates
  ORDER BY store_id, updated_at DESC
) s;
