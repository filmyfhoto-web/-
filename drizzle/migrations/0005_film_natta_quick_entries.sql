CREATE TABLE IF NOT EXISTS public.film_natta_quick_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  tx_type text NOT NULL DEFAULT 'income' CHECK (tx_type IN ('income','expense')),
  category text,
  default_amount numeric,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_natta_quick_entries TO authenticated;
GRANT ALL ON public.film_natta_quick_entries TO service_role;

ALTER TABLE public.film_natta_quick_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read natta quick entries" ON public.film_natta_quick_entries;
CREATE POLICY "staff read natta quick entries" ON public.film_natta_quick_entries
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manage natta quick entries" ON public.film_natta_quick_entries;
CREATE POLICY "admin manage natta quick entries" ON public.film_natta_quick_entries
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.film_natta_quick_entries_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_film_natta_quick_entries_touch ON public.film_natta_quick_entries;
CREATE TRIGGER trg_film_natta_quick_entries_touch BEFORE UPDATE ON public.film_natta_quick_entries
FOR EACH ROW EXECUTE FUNCTION public.film_natta_quick_entries_touch();