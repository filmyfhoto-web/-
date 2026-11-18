CREATE TABLE public.school_requisition_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id uuid NOT NULL REFERENCES public.school_requisitions(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX school_requisition_logs_req_idx ON public.school_requisition_logs (requisition_id, created_at DESC);

GRANT SELECT, INSERT ON public.school_requisition_logs TO authenticated;
GRANT ALL ON public.school_requisition_logs TO service_role;

ALTER TABLE public.school_requisition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or staff can read requisition logs"
ON public.school_requisition_logs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.school_requisitions r WHERE r.id = requisition_id AND r.user_id = auth.uid())
  OR has_role(auth.uid(), 'owner'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'stock_staff'::app_role)
  OR has_role(auth.uid(), 'photo_staff'::app_role)
);

CREATE POLICY "Owner or staff can write requisition logs"
ON public.school_requisition_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.school_requisitions r WHERE r.id = requisition_id AND r.user_id = auth.uid())
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'stock_staff'::app_role)
    OR has_role(auth.uid(), 'photo_staff'::app_role)
  )
);