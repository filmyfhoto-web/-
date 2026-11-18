CREATE TABLE public.school_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  school_name text NOT NULL DEFAULT '',
  project_name text NOT NULL DEFAULT '',
  prepared_by text NOT NULL DEFAULT '',
  doc_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  note text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX school_requisitions_user_idx ON public.school_requisitions(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_requisitions TO authenticated;
GRANT ALL ON public.school_requisitions TO service_role;

ALTER TABLE public.school_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own requisitions"
ON public.school_requisitions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Staff can view requisitions"
ON public.school_requisitions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'stock_staff'::app_role)
  OR has_role(auth.uid(), 'photo_staff'::app_role)
);

CREATE TRIGGER school_requisitions_touch
BEFORE UPDATE ON public.school_requisitions
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();