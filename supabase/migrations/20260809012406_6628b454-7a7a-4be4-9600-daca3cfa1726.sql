CREATE TABLE public.customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  topic text NOT NULL DEFAULT 'อื่น ๆ',
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.customer_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_messages TO service_role;
GRANT ALL ON public.customer_messages TO service_role;

ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers read own messages" ON public.customer_messages
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "customers insert own messages" ON public.customer_messages
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND length(btrim(message)) BETWEEN 1 AND 1000);

CREATE POLICY "staff read all messages" ON public.customer_messages
FOR SELECT TO authenticated USING (public.is_staff_any(auth.uid()));

CREATE POLICY "staff update messages" ON public.customer_messages
FOR UPDATE TO authenticated USING (public.is_staff_any(auth.uid())) WITH CHECK (public.is_staff_any(auth.uid()));

CREATE INDEX idx_customer_messages_user ON public.customer_messages(user_id, created_at DESC);
CREATE INDEX idx_customer_messages_unread ON public.customer_messages(is_read, created_at DESC);

CREATE TRIGGER trg_customer_messages_touch
BEFORE UPDATE ON public.customer_messages
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();