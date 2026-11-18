
CREATE TABLE IF NOT EXISTS public.reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reply_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reply_templates TO authenticated;
GRANT ALL ON public.reply_templates TO service_role;

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reply_templates_read" ON public.reply_templates;
CREATE POLICY "reply_templates_read" ON public.reply_templates
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "reply_templates_write" ON public.reply_templates;
CREATE POLICY "reply_templates_write" ON public.reply_templates
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_reply_templates_updated_at ON public.reply_templates;
CREATE TRIGGER trg_reply_templates_updated_at
  BEFORE UPDATE ON public.reply_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add template_id link on order_replies (nullable, no FK cascade issues)
ALTER TABLE public.order_replies
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.reply_templates(id) ON DELETE SET NULL;

-- Seed default templates
INSERT INTO public.reply_templates (name, category, content, sort_order, variables) VALUES
('รับออเดอร์แล้ว', 'order',
'สวัสดีค่ะ คุณ {{customer_name}}
ทางร้านได้รับออเดอร์เลขที่ {{order_number}} เรียบร้อยแล้วค่ะ

รายการสินค้า:
{{order_items}}

ทางร้านจะตรวจสอบรายละเอียดและแจ้งกลับอีกครั้งนะคะ
ขอบคุณค่ะ 🙏
{{shop_name}}', 10,
'["customer_name","order_number","order_items","shop_name"]'::jsonb),

('รอเสนอราคา', 'order',
'สวัสดีค่ะ คุณ {{customer_name}}
ทางร้านกำลังจัดเตรียมใบเสนอราคาสำหรับออเดอร์ {{order_number}} อยู่ค่ะ

รายการสินค้า:
{{order_items}}

จะแจ้งราคากลับให้โดยเร็วที่สุดค่ะ 🙏
{{shop_name}}', 20,
'["customer_name","order_number","order_items","shop_name"]'::jsonb),

('แจ้งยอดรวม', 'payment',
'สวัสดีค่ะ คุณ {{customer_name}}
ออเดอร์เลขที่ {{order_number}} มียอดรวมทั้งหมด {{total_amount}} ค่ะ

รายการสินค้า:
{{order_items}}

สามารถชำระเงินและส่งสลิปกลับมาได้เลยนะคะ 🙏
{{shop_name}}', 30,
'["customer_name","order_number","order_items","total_amount","shop_name"]'::jsonb),

('ขอข้อมูลเพิ่มเติม', 'info',
'สวัสดีค่ะ คุณ {{customer_name}}
ทางร้านขอข้อมูลเพิ่มเติมสำหรับออเดอร์เลขที่ {{order_number}} ค่ะ

กรุณาส่งรายละเอียดเพิ่มเติม เช่น ไฟล์งาน จำนวน ขนาด สี หรือข้อมูลที่ต้องการให้ร้านดำเนินการ

ขอบคุณค่ะ 🙏
{{shop_name}}', 40,
'["customer_name","order_number","shop_name"]'::jsonb),

('สินค้าพร้อมรับ', 'shipping',
'สวัสดีค่ะ คุณ {{customer_name}}
ออเดอร์เลขที่ {{order_number}} ดำเนินการเรียบร้อยแล้วค่ะ

ลูกค้าสามารถเข้ามารับสินค้าได้ที่ร้าน
วันที่รับสินค้า: {{pickup_date}}

ขอบคุณค่ะ 📦
{{shop_name}}', 50,
'["customer_name","order_number","pickup_date","shop_name"]'::jsonb),

('แจ้งชำระเงิน', 'payment',
'สวัสดีค่ะ คุณ {{customer_name}}
ได้รับยอดชำระเงินสำหรับออเดอร์ {{order_number}} เรียบร้อยแล้วค่ะ ✅
สถานะ: {{payment_status}}

ขอบคุณมากค่ะ 🙏
{{shop_name}}', 60,
'["customer_name","order_number","payment_status","shop_name"]'::jsonb),

('แจ้งกำลังดำเนินการ', 'status',
'สวัสดีค่ะ คุณ {{customer_name}}
ออเดอร์ {{order_number}} กำลังอยู่ในขั้นตอนการดำเนินการค่ะ
จะแจ้งความคืบหน้าให้ทราบอีกครั้งนะคะ 🙏
{{shop_name}}', 70,
'["customer_name","order_number","shop_name"]'::jsonb),

('แจ้งส่งงาน/ส่งสินค้า', 'shipping',
'สวัสดีค่ะ คุณ {{customer_name}}
ออเดอร์ {{order_number}} จัดส่งเรียบร้อยแล้วค่ะ 📦
กรุณาตรวจสอบและแจ้งกลับหากได้รับสินค้าเรียบร้อยนะคะ 🙏
{{shop_name}}', 80,
'["customer_name","order_number","shop_name"]'::jsonb),

('ยกเลิกออเดอร์', 'status',
'เรียนคุณ {{customer_name}}
ต้องขออภัยเป็นอย่างสูงค่ะ
ออเดอร์ {{order_number}} จำเป็นต้องยกเลิก

หากมีข้อสงสัยสามารถติดต่อกลับได้ค่ะ 🙏
{{shop_name}}', 90,
'["customer_name","order_number","shop_name"]'::jsonb),

('ขอบคุณลูกค้า', 'general',
'ขอบคุณคุณ {{customer_name}} ที่อุดหนุนร้านนะคะ 🙏
หากมีความต้องการสั่งซื้อเพิ่มเติม สามารถทักกลับมาได้ตลอดเลยค่ะ
{{shop_name}}', 100,
'["customer_name","shop_name"]'::jsonb)
ON CONFLICT DO NOTHING;
