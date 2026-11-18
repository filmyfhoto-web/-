ALTER TABLE public.rds_drafts DROP CONSTRAINT IF EXISTS rds_drafts_kind_check;
ALTER TABLE public.rds_drafts
  ADD CONSTRAINT rds_drafts_kind_check
  CHECK (kind IN ('document','pos','settings','import'));