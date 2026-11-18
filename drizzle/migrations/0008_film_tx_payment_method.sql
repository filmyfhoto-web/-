ALTER TABLE public.film_transactions
  ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'film_transactions_payment_method_check'
  ) THEN
    ALTER TABLE public.film_transactions
      ADD CONSTRAINT film_transactions_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('cash','transfer','promptpay','card','ewallet','other'));
  END IF;
END $$;