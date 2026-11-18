CREATE TABLE public.film_quick_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'ชิ้น',
  category text NOT NULL DEFAULT 'other',
  pinned boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.film_quick_items TO authenticated;
GRANT ALL ON public.film_quick_items TO service_role;

ALTER TABLE public.film_quick_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read quick items"
  ON public.film_quick_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert quick items"
  ON public.film_quick_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update quick items"
  ON public.film_quick_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Staff can delete quick items"
  ON public.film_quick_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER film_quick_items_touch
  BEFORE UPDATE ON public.film_quick_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();