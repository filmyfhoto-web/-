
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS drive_sync_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_sync_status text,
  ADD COLUMN IF NOT EXISTS drive_sync_error text;

CREATE INDEX IF NOT EXISTS idx_organizations_drive_sync_last_at
  ON public.organizations (drive_sync_last_at DESC NULLS LAST);

-- RPC ให้แอดมินรีเซ็ตสถานะ (เพื่อ trigger สร้าง/ตรวจโฟลเดอร์ใหม่ครั้งถัดไป)
CREATE OR REPLACE FUNCTION public.admin_org_reset_drive_folder(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.organizations
     SET drive_folder_id = NULL,
         drive_sync_status = 'pending',
         drive_sync_error = NULL
   WHERE id = p_org_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_org_reset_drive_folder(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_org_reset_drive_folder(uuid) TO authenticated, service_role;
