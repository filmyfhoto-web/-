INSERT INTO public.rds_stores (slug, name, phone, address, vat_enabled, default_vat_rate, footer_text)
SELECT 'film', 'NATTAWORKS (FILM SHOP)', s.phone, s.address, true, 7, 'ขอบคุณที่ใช้บริการค่ะ'
FROM public.rds_stores s WHERE s.slug = 'printing'
ON CONFLICT DO NOTHING;

UPDATE public.line_notification_channels c
SET store_id = (SELECT id::text FROM public.rds_stores WHERE slug = 'film' LIMIT 1),
    updated_at = now(),
    last_verified_at = now()
WHERE c.line_destination_id = 'Caf74defcb2d799f87fbe81257b219440';