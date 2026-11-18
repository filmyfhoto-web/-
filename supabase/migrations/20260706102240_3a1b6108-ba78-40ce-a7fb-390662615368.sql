alter table public.rds_stores
  add column if not exists sheet_tab_map jsonb not null default '{}'::jsonb;