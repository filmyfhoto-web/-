ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by text,
  ADD COLUMN IF NOT EXISTS delivery_note_file jsonb,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_note_sent_by text;