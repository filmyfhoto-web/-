ALTER TABLE public.customer_purchase_orders
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by text,
  ADD COLUMN IF NOT EXISTS delivery_note_file jsonb,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_by text;

ALTER TABLE public.school_requisitions
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by text,
  ADD COLUMN IF NOT EXISTS delivery_note_file jsonb,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_by text,
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS desk_stage text;

CREATE INDEX IF NOT EXISTS idx_cpo_ack_at ON public.customer_purchase_orders (acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_cpo_dn_sent_at ON public.customer_purchase_orders (delivery_note_sent_at);
CREATE INDEX IF NOT EXISTS idx_sreq_ack_at ON public.school_requisitions (acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_sreq_dn_sent_at ON public.school_requisitions (delivery_note_sent_at);