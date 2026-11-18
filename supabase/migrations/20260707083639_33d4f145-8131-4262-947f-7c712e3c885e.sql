ALTER TABLE public.rds_stores
ADD COLUMN IF NOT EXISTS drive_folder_map jsonb NOT NULL DEFAULT '{}'::jsonb;