ALTER TABLE public.shop_theme_settings
  ADD COLUMN IF NOT EXISTS font_scale numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shop_name text,
  ADD COLUMN IF NOT EXISTS shop_logo_url text,
  ADD COLUMN IF NOT EXISTS shop_line_id text,
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[{"key":"store","visible":true},{"key":"services","visible":true},{"key":"banners","visible":true},{"key":"recommended","visible":true},{"key":"nav","visible":true}]'::jsonb;