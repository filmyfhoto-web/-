-- Columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reply_draft TEXT;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS receipt_reply_template TEXT,
  ADD COLUMN IF NOT EXISTS receipt_line_template TEXT;

UPDATE public.settings
SET receipt_reply_template = COALESCE(receipt_reply_template,
'สวัสดีค่ะคุณ {customer_name} 🙏
ทาง {store_name} ได้รับคำสั่งซื้อ #{order_no} เรียบร้อยแล้วค่ะ

รายการสินค้า:
{items}

ยอดรวม: ฿{total}

ชำระเงินได้ที่: {payment_link}
ขอบคุณที่อุดหนุนค่ะ 💖'),
    receipt_line_template = COALESCE(receipt_line_template,
'🧾 ใบเสร็จอิเล็กทรอนิกส์
{store_name}
────────────────
{receipt_header}

เลขที่: {receipt_no}
วันที่: {receipt_issued_at}
ลูกค้า: {customer_name}

รายการ:
{items}
────────────────
รวมทั้งสิ้น: ฿{total}

📎 ดาวน์โหลด: {receipt_url}

{receipt_footer}');

DROP FUNCTION IF EXISTS public.get_public_settings();

CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(
  store_name TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  tax_id TEXT,
  receipt_header TEXT,
  receipt_footer TEXT,
  receipt_reply_template TEXT,
  receipt_line_template TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.store_name,
    s.phone,
    s.address,
    s.logo_url,
    s.tax_id,
    s.receipt_header,
    s.receipt_footer,
    s.receipt_reply_template,
    s.receipt_line_template
  FROM public.settings s
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_order_reply_draft(_order_id UUID, _draft TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  UPDATE public.orders SET reply_draft = _draft WHERE id = _order_id;

  INSERT INTO public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'reply_draft_saved', 'order', _order_id,
          jsonb_build_object('length', COALESCE(length(_draft), 0)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_order_reply_draft(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_order_receipt(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_no TEXT;
  _prev_issued TIMESTAMPTZ;
  _prev_paid TIMESTAMPTZ;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT receipt_no, receipt_issued_at, paid_at
    INTO _prev_no, _prev_issued, _prev_paid
    FROM public.orders WHERE id = _order_id;

  UPDATE public.orders
     SET receipt_no = NULL,
         receipt_issued_at = NULL,
         paid_at = NULL
   WHERE id = _order_id;

  INSERT INTO public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'receipt_voided', 'order', _order_id,
          jsonb_build_object(
            'voided_receipt_no', _prev_no,
            'voided_issued_at', _prev_issued,
            'voided_paid_at', _prev_paid
          ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_order_receipt(UUID) TO authenticated;