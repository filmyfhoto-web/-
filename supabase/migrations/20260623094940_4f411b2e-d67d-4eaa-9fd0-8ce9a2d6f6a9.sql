CREATE TABLE IF NOT EXISTS public.rds_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  store_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('document','pos')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rds_drafts_unique UNIQUE (user_id, store_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rds_drafts TO authenticated;
GRANT ALL ON public.rds_drafts TO service_role;

ALTER TABLE public.rds_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drafts"
  ON public.rds_drafts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER rds_drafts_set_updated_at
  BEFORE UPDATE ON public.rds_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS rds_drafts_user_store_kind_idx
  ON public.rds_drafts (user_id, store_id, kind);