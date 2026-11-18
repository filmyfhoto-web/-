CREATE TABLE IF NOT EXISTS public.film_shop_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL UNIQUE,
  display_name text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_shop_managers TO authenticated;
GRANT ALL ON public.film_shop_managers TO service_role;

ALTER TABLE public.film_shop_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read film managers" ON public.film_shop_managers;
CREATE POLICY "staff read film managers" ON public.film_shop_managers
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owner manage film managers" ON public.film_shop_managers;
CREATE POLICY "owner manage film managers" ON public.film_shop_managers
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.film_shop_managers_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_film_shop_managers_touch ON public.film_shop_managers;
CREATE TRIGGER trg_film_shop_managers_touch BEFORE UPDATE ON public.film_shop_managers
FOR EACH ROW EXECUTE FUNCTION public.film_shop_managers_touch();