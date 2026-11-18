
CREATE TABLE public.nw_line_test_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX nw_line_test_recipients_store_idx ON public.nw_line_test_recipients(store_id);
CREATE UNIQUE INDEX nw_line_test_recipients_default_unique
  ON public.nw_line_test_recipients(store_id) WHERE is_default = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nw_line_test_recipients TO authenticated;
GRANT ALL ON public.nw_line_test_recipients TO service_role;

ALTER TABLE public.nw_line_test_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nw_line_test_recipients store staff"
  ON public.nw_line_test_recipients
  FOR ALL
  USING (public.nw_has_store_access(store_id))
  WITH CHECK (public.nw_has_store_access(store_id));

CREATE TRIGGER nw_line_test_recipients_set_updated_at
  BEFORE UPDATE ON public.nw_line_test_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
