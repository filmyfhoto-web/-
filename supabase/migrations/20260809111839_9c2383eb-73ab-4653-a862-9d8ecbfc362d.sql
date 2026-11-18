CREATE TABLE public.film_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'line',
  store_id text NOT NULL DEFAULT 'default',
  external_thread_id text NOT NULL,
  external_user_id text,
  customer_id uuid REFERENCES public.film_customers(id) ON DELETE SET NULL,
  display_name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'open',
  assignee uuid,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  last_order_id uuid REFERENCES public.film_orders(id) ON DELETE SET NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX film_conversations_external_uk
  ON public.film_conversations (channel, store_id, external_thread_id);
CREATE INDEX film_conversations_last_message_idx
  ON public.film_conversations (last_message_at DESC NULLS LAST);
CREATE INDEX film_conversations_status_idx ON public.film_conversations (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_conversations TO authenticated;
GRANT ALL ON public.film_conversations TO service_role;
ALTER TABLE public.film_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_conversations" ON public.film_conversations
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.film_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.film_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  channel text NOT NULL DEFAULT 'line',
  external_message_id text,
  text text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('pending','sent','failed')),
  error_code text,
  sender_user_id uuid,
  idempotency_key text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX film_messages_external_uk
  ON public.film_messages (channel, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE UNIQUE INDEX film_messages_idempotency_uk
  ON public.film_messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX film_messages_conversation_idx
  ON public.film_messages (conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_messages TO authenticated;
GRANT ALL ON public.film_messages TO service_role;
ALTER TABLE public.film_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage film_messages" ON public.film_messages
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER film_conversations_touch BEFORE UPDATE ON public.film_conversations
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();
CREATE TRIGGER film_messages_touch BEFORE UPDATE ON public.film_messages
  FOR EACH ROW EXECUTE FUNCTION public.film_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.film_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.film_messages;