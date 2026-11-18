-- 1) Customer code ที่เสถียร (additive)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS customer_code text;

UPDATE public.profiles SET customer_code = 'CUS-' || upper(substr(md5(id::text), 1, 6))
WHERE customer_code IS NULL;
UPDATE public.organizations SET customer_code = 'ORG-' || upper(substr(md5(id::text), 1, 6))
WHERE customer_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_customer_code_key ON public.profiles (customer_code);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_customer_code_key ON public.organizations (customer_code);

CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_code IS NULL THEN
    NEW.customer_code := CASE TG_TABLE_NAME
      WHEN 'organizations' THEN 'ORG-' ELSE 'CUS-' END
      || upper(substr(md5(NEW.id::text), 1, 6));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_set_customer_code ON public.profiles;
CREATE TRIGGER profiles_set_customer_code BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();
DROP TRIGGER IF EXISTS organizations_set_customer_code ON public.organizations;
CREATE TRIGGER organizations_set_customer_code BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();

-- 2) Excel intake ของลูกค้า
CREATE TABLE IF NOT EXISTS public.customer_excel_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  school_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  filename text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'excel',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'submitted',
  converted_to text,
  converted_id uuid,
  converted_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.customer_excel_intakes TO authenticated;
GRANT ALL ON public.customer_excel_intakes TO service_role;

ALTER TABLE public.customer_excel_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own excel intake read" ON public.customer_excel_intakes;
CREATE POLICY "own excel intake read" ON public.customer_excel_intakes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "own excel intake insert" ON public.customer_excel_intakes;
CREATE POLICY "own excel intake insert" ON public.customer_excel_intakes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "staff excel intake update" ON public.customer_excel_intakes;
CREATE POLICY "staff excel intake update" ON public.customer_excel_intakes
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS customer_excel_intakes_user_idx
  ON public.customer_excel_intakes (user_id, created_at DESC);

DROP TRIGGER IF EXISTS customer_excel_intakes_touch ON public.customer_excel_intakes;
CREATE TRIGGER customer_excel_intakes_touch BEFORE UPDATE ON public.customer_excel_intakes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 3) จับคู่ / ยกเลิกจับคู่ LINE (staff only + audit)
CREATE OR REPLACE FUNCTION public.admin_bind_line_customer(
  p_line_user_id text, p_customer_id uuid, p_force boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid; v_name text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_line_user_id IS NULL OR p_customer_id IS NULL THEN RAISE EXCEPTION 'invalid_input'; END IF;

  SELECT customer_id INTO v_existing FROM public.line_account_links WHERE line_user_id = p_line_user_id;
  IF v_existing IS NOT NULL AND v_existing <> p_customer_id AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'existing_customer_id', v_existing);
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = p_customer_id;

  INSERT INTO public.line_account_links (line_user_id, customer_id, customer_source, verified_at, updated_at)
  VALUES (p_line_user_id, p_customer_id, 'admin_manual', now(), now())
  ON CONFLICT (line_user_id) DO UPDATE
    SET customer_id = EXCLUDED.customer_id,
        customer_source = 'admin_manual',
        verified_at = now(),
        updated_at = now();

  INSERT INTO public.security_audit_log (event_type, severity, actor_user_id, target_type, target_id, detail)
  VALUES ('line_bind_customer', 'info', auth.uid(), 'line_account_links', p_line_user_id,
          jsonb_build_object('customer_id', p_customer_id, 'customer_name', v_name,
                             'previous_customer_id', v_existing, 'forced', p_force));

  RETURN jsonb_build_object('ok', true, 'customer_id', p_customer_id);
END $$;

REVOKE ALL ON FUNCTION public.admin_bind_line_customer(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_bind_line_customer(text, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unbind_line_customer(p_line_user_id text, p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_existing uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT customer_id INTO v_existing FROM public.line_account_links WHERE line_user_id = p_line_user_id;
  IF v_existing IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_bound'); END IF;

  UPDATE public.line_account_links
     SET customer_id = NULL, customer_source = 'admin_unbound', updated_at = now()
   WHERE line_user_id = p_line_user_id;

  INSERT INTO public.security_audit_log (event_type, severity, actor_user_id, target_type, target_id, detail)
  VALUES ('line_unbind_customer', 'warn', auth.uid(), 'line_account_links', p_line_user_id,
          jsonb_build_object('previous_customer_id', v_existing, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.admin_unbind_line_customer(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_unbind_line_customer(text, text) TO authenticated;

-- 4) แปลง Excel intake -> ใบเขียนเบิก / ใบสั่งซื้อของลูกค้า (idempotent)
CREATE OR REPLACE FUNCTION public.admin_convert_excel_intake(p_id uuid, p_target text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.customer_excel_intakes%ROWTYPE; v_new uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.customer_excel_intakes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF r.converted_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'target', r.converted_to, 'id', r.converted_id);
  END IF;

  IF p_target = 'requisition' THEN
    INSERT INTO public.school_requisitions (user_id, school_name, project_name, prepared_by, doc_date, status, items, total, note, submitted_at)
    VALUES (r.user_id, coalesce(nullif(r.school_name, ''), '-'), 'นำเข้าจาก Excel', r.customer_name, current_date,
            'submitted', r.items, r.total, r.note, now())
    RETURNING id INTO v_new;
  ELSIF p_target = 'purchase_order' THEN
    INSERT INTO public.customer_purchase_orders (user_id, customer_name, customer_phone, school_or_org, document_date, items, subtotal, net_total, note, status, source, submitted_at)
    VALUES (r.user_id, coalesce(nullif(r.customer_name, ''), '-'), r.phone, r.school_name, current_date,
            r.items, r.total, r.total, r.note, 'submitted', 'excel_intake', now())
    RETURNING id INTO v_new;
  ELSE
    RAISE EXCEPTION 'invalid_target';
  END IF;

  UPDATE public.customer_excel_intakes
     SET status = 'converted', converted_to = p_target, converted_id = v_new, converted_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'target', p_target, 'id', v_new);
END $$;

REVOKE ALL ON FUNCTION public.admin_convert_excel_intake(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_convert_excel_intake(uuid, text) TO authenticated;