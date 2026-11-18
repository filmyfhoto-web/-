CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.shop_promos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT,
  sort INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shop_promos TO anon, authenticated;
GRANT ALL ON public.shop_promos TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.shop_promos TO authenticated;

ALTER TABLE public.shop_promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read active promos"
ON public.shop_promos FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manage promos"
ON public.shop_promos FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_shop_promos_updated_at
BEFORE UPDATE ON public.shop_promos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_shop_promos_active_sort ON public.shop_promos (is_active, sort);