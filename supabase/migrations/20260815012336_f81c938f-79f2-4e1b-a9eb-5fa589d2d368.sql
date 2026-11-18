CREATE TABLE public.line_doc_bot_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text NOT NULL,
  line_user_id text NOT NULL,
  shop_key text NOT NULL,
  store_id uuid,
  status text NOT NULL DEFAULT 'open',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  document_no text,
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX line_doc_bot_drafts_open_idx ON public.line_doc_bot_drafts (group_id, line_user_id, status, updated_at DESC);
GRANT SELECT ON public.line_doc_bot_drafts TO authenticated;
GRANT ALL ON public.line_doc_bot_drafts TO service_role;
ALTER TABLE public.line_doc_bot_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_doc_bot_drafts_admin_read" ON public.line_doc_bot_drafts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.line_doc_bot_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid,
  quotation_no text NOT NULL,
  group_id text,
  approved_by_line_user_id text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX line_doc_bot_approvals_uniq ON public.line_doc_bot_approvals (COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid), quotation_no);
GRANT SELECT ON public.line_doc_bot_approvals TO authenticated;
GRANT ALL ON public.line_doc_bot_approvals TO service_role;
ALTER TABLE public.line_doc_bot_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_doc_bot_approvals_admin_read" ON public.line_doc_bot_approvals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.line_doc_bot_actions (
  action_key text NOT NULL PRIMARY KEY,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.line_doc_bot_actions TO authenticated;
GRANT ALL ON public.line_doc_bot_actions TO service_role;
ALTER TABLE public.line_doc_bot_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_doc_bot_actions_admin_read" ON public.line_doc_bot_actions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.line_doc_bot_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text,
  line_user_id text,
  action text NOT NULL,
  draft_id uuid,
  document_no text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX line_doc_bot_audit_created_idx ON public.line_doc_bot_audit (created_at DESC);
GRANT SELECT ON public.line_doc_bot_audit TO authenticated;
GRANT ALL ON public.line_doc_bot_audit TO service_role;
ALTER TABLE public.line_doc_bot_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_doc_bot_audit_admin_read" ON public.line_doc_bot_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER line_doc_bot_drafts_touch BEFORE UPDATE ON public.line_doc_bot_drafts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TRIGGER line_doc_bot_approvals_touch BEFORE UPDATE ON public.line_doc_bot_approvals
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();