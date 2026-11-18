ALTER TABLE public.pos_receipts
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IN ('preparing','shipping','delivered','cancelled')),
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_phone text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS pos_receipts_delivery_status_idx
  ON public.pos_receipts (delivery_status)
  WHERE delivery_status IS NOT NULL;