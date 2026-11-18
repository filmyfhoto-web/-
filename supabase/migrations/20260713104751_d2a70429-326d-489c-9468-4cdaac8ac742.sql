DO $seed$
DECLARE v_store uuid;
BEGIN
  SELECT id INTO v_store FROM public.film_stores WHERE slug = 'film' LIMIT 1;
  IF v_store IS NULL THEN RETURN; END IF;

  INSERT INTO public.film_document_settings (store_id, document_type, title, prefix, running_format, next_number) VALUES
    (v_store, 'quotation',   'ใบเสนอราคา',      'QT',  '{prefix}-{yyyy}-{seq:0000}', 1),
    (v_store, 'invoice',     'ใบแจ้งหนี้',       'INV', '{prefix}-{yyyy}-{seq:0000}', 1),
    (v_store, 'receipt',     'ใบเสร็จรับเงิน',    'RC',  '{prefix}-{yyyy}-{seq:0000}', 1),
    (v_store, 'delivery',    'ใบสั่งจ้าง / ส่งของ', 'DO',  '{prefix}-{yyyy}-{seq:0000}', 1),
    (v_store, 'tax_invoice', 'ใบกำกับภาษี',      'TAX', '{prefix}-{yyyy}-{seq:0000}', 1)
  ON CONFLICT (store_id, document_type) DO NOTHING;

  INSERT INTO public.film_payment_methods (store_id, name, sort_order) VALUES
    (v_store, 'เงินสด', 1), (v_store, 'โอนเงิน', 2),
    (v_store, 'QR Payment', 3), (v_store, 'บัตร', 4), (v_store, 'เครดิต', 5)
  ON CONFLICT (store_id, name) DO NOTHING;

  INSERT INTO public.film_units (store_id, name) VALUES
    (v_store, 'ตร.ม.'), (v_store, 'ชิ้น'), (v_store, 'ม้วน'), (v_store, 'แผ่น')
  ON CONFLICT (store_id, name) DO NOTHING;

  INSERT INTO public.film_tax_rates (store_id, label, rate) VALUES
    (v_store, 'ไม่มี VAT', 0), (v_store, 'VAT 7%', 7)
  ON CONFLICT (store_id, rate) DO NOTHING;
END $seed$;