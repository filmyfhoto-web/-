CREATE TABLE IF NOT EXISTS public.line_order_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE,
  conversation_id uuid,
  state text NOT NULL DEFAULT 'dismissed',
  converted_to text,
  converted_id uuid,
  acted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_order_hints_state_chk CHECK (state IN ('dismissed', 'converted'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_order_hints TO authenticated;
GRANT ALL ON public.line_order_hints TO service_role;

ALTER TABLE public.line_order_hints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_order_hints_staff_read" ON public.line_order_hints
  FOR SELECT TO authenticated
  USING (public.is_staff_any(auth.uid()));

CREATE POLICY "line_order_hints_staff_write" ON public.line_order_hints
  FOR ALL TO authenticated
  USING (public.is_staff_any(auth.uid()))
  WITH CHECK (public.is_staff_any(auth.uid()));

CREATE TRIGGER line_order_hints_touch
  BEFORE UPDATE ON public.line_order_hints
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.line_order_hints IS
  'สถานะคำแนะนำ "ข้อความ LINE นี้น่าจะเป็นรายการสั่งของ" — ข้าม/แปลงเป็นงานแล้ว';