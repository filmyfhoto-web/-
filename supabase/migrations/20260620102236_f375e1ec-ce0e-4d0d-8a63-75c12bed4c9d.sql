INSERT INTO public.price_groups (name, markup_percent, is_custom, sort_order)
SELECT '+15%', 15, false, 15
WHERE NOT EXISTS (SELECT 1 FROM public.price_groups WHERE markup_percent = 15 AND is_custom = false);