ALTER TABLE public.school_requisitions
  ADD COLUMN IF NOT EXISTS converted_po_id uuid REFERENCES public.customer_purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE INDEX IF NOT EXISTS school_requisitions_converted_po_id_idx
  ON public.school_requisitions(converted_po_id);

DROP POLICY IF EXISTS "Staff can update requisitions" ON public.school_requisitions;
CREATE POLICY "Staff can update requisitions"
  ON public.school_requisitions
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'stock_staff'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'stock_staff'::app_role)
  );

GRANT SELECT, UPDATE ON public.school_requisitions TO authenticated;