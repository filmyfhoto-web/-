DELETE FROM public.notifications WHERE ref_id = '6163c8eb-07d0-4cf1-a428-d6c006bf630c';
DELETE FROM public.order_status_events WHERE order_id = '6163c8eb-07d0-4cf1-a428-d6c006bf630c';
DELETE FROM public.orders WHERE id = '6163c8eb-07d0-4cf1-a428-d6c006bf630c' AND order_no LIKE 'TEST-NOTIFY-%';