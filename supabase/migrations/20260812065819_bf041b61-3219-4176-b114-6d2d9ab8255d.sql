CREATE TABLE IF NOT EXISTS public.fs_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text not null default 'ลิงก์แชร์ FS',
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz,
  revoked boolean not null default false,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fs_share_links TO authenticated;
GRANT ALL ON public.fs_share_links TO service_role;

ALTER TABLE public.fs_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_share_links_admin_all" ON public.fs_share_links;
CREATE POLICY "fs_share_links_admin_all" ON public.fs_share_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS fs_share_links_token_idx ON public.fs_share_links(token);