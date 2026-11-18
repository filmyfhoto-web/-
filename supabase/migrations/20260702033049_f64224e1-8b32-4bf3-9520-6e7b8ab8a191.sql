
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_image_urls_max5;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_image_urls_max5
  CHECK (coalesce(array_length(image_urls, 1), 0) <= 5);
