
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_privacy_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text,
  ADD COLUMN IF NOT EXISTS accepted_privacy_version text;

DROP POLICY IF EXISTS "users insert own logs" ON public.activity_logs;
CREATE POLICY "users insert own logs" ON public.activity_logs
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      is_staff(auth.uid())
      OR action = ANY (ARRAY[
        'submit_order','login','logout',
        'accept_terms','accept_privacy','revoke_consent'
      ])
    )
  );
