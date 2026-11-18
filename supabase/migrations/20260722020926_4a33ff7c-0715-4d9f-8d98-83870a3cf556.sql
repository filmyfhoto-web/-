-- Backfill product_line based on category name & product name heuristics
UPDATE public.products p
SET product_line = 'colorlab'
FROM public.categories c
WHERE p.category_id = c.id
  AND p.product_line IS DISTINCT FROM 'colorlab'
  AND (
    c.name ~* '(ฟิล์ม|อัดรูป|ล้างรูป|ล้างฟิล์ม|ถ่ายรูป|ภาพ|โฟโต|photo|film|lab)'
    OR p.name ~* '(ฟิล์ม|อัดรูป|ล้างรูป|ล้างฟิล์ม|โฟโต|photo|film)'
  );

UPDATE public.products p
SET product_line = 'print'
FROM public.categories c
WHERE p.category_id = c.id
  AND p.product_line = 'other'
  AND (
    c.name ~* '(พิมพ์|สติ๊กเกอร์|สติกเกอร์|ไวนิล|อิงค์เจ็ท|อิงเจ็ท|เพลท|โปสเตอร์|นามบัตร|print|sticker|vinyl|inkjet|banner)'
    OR p.name ~* '(พิมพ์|สติ๊กเกอร์|สติกเกอร์|ไวนิล|อิงค์เจ็ท|เพลท|โปสเตอร์|นามบัตร|print|sticker|vinyl|inkjet|banner)'
  );

-- Track when a LINE update was pushed for each job request
ALTER TABLE public.film_job_requests
  ADD COLUMN IF NOT EXISTS line_update_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS line_update_count integer NOT NULL DEFAULT 0;