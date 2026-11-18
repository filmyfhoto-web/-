CREATE TABLE public.document_command_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  temp_ref TEXT NOT NULL DEFAULT ('WO-DRAFT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  doc_type TEXT NOT NULL DEFAULT 'job_order',
  shop_key TEXT NOT NULL DEFAULT 'film',
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_tax_id TEXT,
  project TEXT,
  notes TEXT,
  discount NUMERIC NOT NULL DEFAULT 0,
  vat_mode TEXT NOT NULL DEFAULT 'none',
  vat_rate NUMERIC NOT NULL DEFAULT 7,
  wht_rate NUMERIC NOT NULL DEFAULT 0,
  deposit NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payment_method TEXT,
  due_at TIMESTAMPTZ,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  wht_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'text',
  transcript TEXT,
  raw_command TEXT,
  parsed JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  final_doc_no TEXT,
  final_invoice_id UUID,
  line_user_id TEXT,
  created_by UUID,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_command_drafts_final_doc_no_key
  ON public.document_command_drafts (final_doc_no) WHERE final_doc_no IS NOT NULL;
CREATE INDEX document_command_drafts_status_idx ON public.document_command_drafts (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_command_drafts TO authenticated;
GRANT ALL ON public.document_command_drafts TO service_role;
ALTER TABLE public.document_command_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage command drafts" ON public.document_command_drafts
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.document_command_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID NOT NULL REFERENCES public.document_command_drafts(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_command_items_draft_idx ON public.document_command_items (draft_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_command_items TO authenticated;
GRANT ALL ON public.document_command_items TO service_role;
ALTER TABLE public.document_command_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage command items" ON public.document_command_items
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.document_command_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID REFERENCES public.document_command_drafts(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  line_user_id TEXT,
  actor_id UUID,
  actor_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_command_audit_draft_idx ON public.document_command_audit (draft_id, created_at DESC);

GRANT SELECT, INSERT ON public.document_command_audit TO authenticated;
GRANT ALL ON public.document_command_audit TO service_role;
ALTER TABLE public.document_command_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read command audit" ON public.document_command_audit
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "staff append command audit" ON public.document_command_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_any(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER document_command_drafts_touch
  BEFORE UPDATE ON public.document_command_drafts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TRIGGER document_command_items_touch
  BEFORE UPDATE ON public.document_command_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();