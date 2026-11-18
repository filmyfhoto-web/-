DROP POLICY IF EXISTS "Staff can read quick items" ON public.film_quick_items;
DROP POLICY IF EXISTS "Staff can insert quick items" ON public.film_quick_items;
DROP POLICY IF EXISTS "Staff can update quick items" ON public.film_quick_items;
DROP POLICY IF EXISTS "Staff can delete quick items" ON public.film_quick_items;

CREATE POLICY "Staff can read quick items"
  ON public.film_quick_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['owner','admin','stock_staff','photo_staff','staff'])
  ));

CREATE POLICY "Staff can insert quick items"
  ON public.film_quick_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['owner','admin','stock_staff','photo_staff','staff'])
  ));

CREATE POLICY "Staff can update quick items"
  ON public.film_quick_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['owner','admin','stock_staff','photo_staff','staff'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['owner','admin','stock_staff','photo_staff','staff'])
  ));

CREATE POLICY "Staff can delete quick items"
  ON public.film_quick_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY (ARRAY['owner','admin','stock_staff','photo_staff','staff'])
  ));

INSERT INTO public.film_quick_items (name, price, unit, category, pinned, active, sort_order)
SELECT s.name, s.price, s.unit, s.category, s.pinned, true, s.sort_order
FROM (VALUES
  ('ถ่ายเอกสาร A4 ขาวดำ', 1::numeric, 'แผ่น', 'print', true, 1),
  ('ปริ้นสี A4', 10::numeric, 'แผ่น', 'print', true, 2),
  ('รูปถ่าย 1 นิ้ว 1 โหล', 120::numeric, 'ชุด', 'photo', false, 3),
  ('เข้าเล่มห่วง A4', 35::numeric, 'เล่ม', 'binding', true, 4),
  ('เคลือบ A4', 20::numeric, 'แผ่น', 'print', false, 5),
  ('ออกแบบงานทั่วไป', 150::numeric, 'งาน', 'sign', false, 6)
) AS s(name, price, unit, category, pinned, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.film_quick_items q WHERE q.name = s.name
);