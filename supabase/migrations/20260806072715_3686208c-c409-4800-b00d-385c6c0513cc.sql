ALTER TABLE public.film_orders
  ADD COLUMN IF NOT EXISTS org_name text,
  ADD COLUMN IF NOT EXISTS assignee text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.film_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.film_orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'payment',
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  received_by text,
  receipt_invoice_id uuid,
  note text,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_order_payments TO authenticated;
GRANT ALL ON public.film_order_payments TO service_role;

ALTER TABLE public.film_order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage film_order_payments"
ON public.film_order_payments FOR ALL TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS film_order_payments_order_idx ON public.film_order_payments(order_id);

CREATE OR REPLACE FUNCTION public.film_recalc_order_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_paid numeric := 0;
  v_deposit numeric := 0;
  v_total numeric := 0;
  v_status text;
  v_kinds int := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0),
         COALESCE(SUM(amount) FILTER (WHERE kind = 'deposit'), 0),
         COUNT(*) FILTER (WHERE kind <> 'deposit')
    INTO v_paid, v_deposit, v_kinds
  FROM public.film_order_payments
  WHERE order_id = v_order AND voided_at IS NULL;

  SELECT COALESCE(total, 0) INTO v_total FROM public.film_orders WHERE id = v_order;

  IF v_paid <= 0 THEN
    v_status := 'unpaid';
  ELSIF v_total > 0 AND v_paid >= v_total THEN
    v_status := 'paid';
  ELSIF v_kinds = 0 THEN
    v_status := 'deposit';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE public.film_orders
     SET paid_amount = v_paid,
         deposit = v_deposit,
         payment_status = v_status,
         updated_at = now()
   WHERE id = v_order;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS film_order_payments_recalc ON public.film_order_payments;
CREATE TRIGGER film_order_payments_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.film_order_payments
FOR EACH ROW EXECUTE FUNCTION public.film_recalc_order_payment();

CREATE OR REPLACE FUNCTION public.film_order_payments_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS film_order_payments_touch_trg ON public.film_order_payments;
CREATE TRIGGER film_order_payments_touch_trg
BEFORE UPDATE ON public.film_order_payments
FOR EACH ROW EXECUTE FUNCTION public.film_order_payments_touch();