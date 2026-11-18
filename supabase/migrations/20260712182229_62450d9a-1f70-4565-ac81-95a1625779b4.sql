-- Simple 6-digit admin invite codes per store
CREATE TABLE IF NOT EXISTS public.store_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.rds_stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  role app_role NOT NULL DEFAULT 'admin',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  max_uses int NOT NULL DEFAULT 1,
  use_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_invite_codes_code_format CHECK (code ~ '^[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS store_invite_codes_active_uidx
  ON public.store_invite_codes (store_id, code)
  WHERE use_count < max_uses;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_invite_codes TO authenticated;
GRANT ALL ON public.store_invite_codes TO service_role;

ALTER TABLE public.store_invite_codes ENABLE ROW LEVEL SECURITY;

-- Store staff / owners / admins can view codes for their store
CREATE POLICY "store staff can view invite codes"
  ON public.store_invite_codes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_stores s WHERE s.user_id = auth.uid() AND s.store_id = store_invite_codes.store_id)
  );

CREATE POLICY "store staff can create invite codes"
  ON public.store_invite_codes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_stores s WHERE s.user_id = auth.uid() AND s.store_id = store_invite_codes.store_id)
    )
  );

CREATE POLICY "store staff can revoke invite codes"
  ON public.store_invite_codes FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.staff_stores s WHERE s.user_id = auth.uid() AND s.store_id = store_invite_codes.store_id)
  );

-- Redeem: SECURITY DEFINER function so anon-auth users can consume without direct table update
CREATE OR REPLACE FUNCTION public.redeem_store_invite_code(_code text)
RETURNS TABLE(store_id uuid, role app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.store_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _code IS NULL OR _code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'invalid_code_format';
  END IF;

  SELECT * INTO v_row
  FROM public.store_invite_codes
  WHERE code = _code
    AND expires_at > now()
    AND use_count < max_uses
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'code_not_found_or_expired';
  END IF;

  UPDATE public.store_invite_codes
    SET use_count = use_count + 1
    WHERE id = v_row.id;

  INSERT INTO public.staff_stores (user_id, store_id)
    VALUES (v_uid, v_row.store_id)
    ON CONFLICT (user_id, store_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, v_row.role)
    ON CONFLICT (user_id, role) DO NOTHING;

  store_id := v_row.store_id;
  role := v_row.role;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_store_invite_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_store_invite_code(text) TO authenticated;