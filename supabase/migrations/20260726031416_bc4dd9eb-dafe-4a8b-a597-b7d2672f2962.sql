ALTER TABLE public.admin_invitations
  ADD COLUMN IF NOT EXISTS perm_pos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS perm_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS perm_po boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perm_history boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invitee_name text;