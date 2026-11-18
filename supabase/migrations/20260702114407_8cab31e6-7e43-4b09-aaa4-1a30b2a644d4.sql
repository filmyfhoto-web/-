
CREATE TABLE public.order_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  message text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('copy','line','phone','saved')),
  replied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replied_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_replies TO authenticated;
GRANT ALL ON public.order_replies TO service_role;

ALTER TABLE public.order_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read order_replies"
ON public.order_replies FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'stock_staff')
  OR public.has_role(auth.uid(), 'photo_staff')
);

CREATE POLICY "staff insert order_replies"
ON public.order_replies FOR INSERT TO authenticated
WITH CHECK (
  replied_by = auth.uid()
  AND (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'stock_staff')
    OR public.has_role(auth.uid(), 'photo_staff')
  )
);

CREATE INDEX idx_order_replies_order_created ON public.order_replies(order_id, created_at DESC);
