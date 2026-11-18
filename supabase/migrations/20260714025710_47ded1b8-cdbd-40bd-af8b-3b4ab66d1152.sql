ALTER TABLE public.rds_stores
  ADD COLUMN IF NOT EXISTS attach_biz_reg_url text,
  ADD COLUMN IF NOT EXISTS attach_id_copy_url text,
  ADD COLUMN IF NOT EXISTS attach_bankbook_url text;