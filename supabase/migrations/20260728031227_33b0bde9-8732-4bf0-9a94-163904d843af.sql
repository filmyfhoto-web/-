CREATE TABLE IF NOT EXISTS public.admin_line_enroll_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  consumed_at timestamptz,
  consumed_line_user_id text
);

GRANT ALL ON public.admin_line_enroll_codes TO service_role;
ALTER TABLE public.admin_line_enroll_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read enroll codes" ON public.admin_line_enroll_codes;
CREATE POLICY "admins read enroll codes"
ON public.admin_line_enroll_codes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
GRANT SELECT ON public.admin_line_enroll_codes TO authenticated;

CREATE INDEX IF NOT EXISTS admin_line_enroll_codes_code_idx ON public.admin_line_enroll_codes(code);