
-- เพิ่ม slug + drive_folder_id ใน organizations เพื่อสร้างลิงก์เฉพาะหน่วยงาน
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- ฟังก์ชันสร้าง slug จากชื่อ (รองรับไทย→transliterate แบบง่าย; fallback เป็น org-<6 hex>)
CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  i int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  IF base = '' OR length(base) < 2 THEN
    base := 'org-' || substr(md5(coalesce(p_name,'') || clock_timestamp()::text), 1, 6);
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = candidate) LOOP
    i := i + 1;
    candidate := base || '-' || i::text;
  END LOOP;
  RETURN candidate;
END $$;

-- Backfill slug ของหน่วยงานที่ยังไม่มี
UPDATE public.organizations SET slug = public.generate_org_slug(name)
WHERE slug IS NULL;

-- Trigger: ใส่ slug อัตโนมัติเมื่อสร้างใหม่
CREATE OR REPLACE FUNCTION public.organizations_set_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_org_slug(NEW.name);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_set_slug_trg ON public.organizations;
CREATE TRIGGER organizations_set_slug_trg
BEFORE INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.organizations_set_slug();

-- RPC public: ดึงหน่วยงานจาก slug สำหรับหน้าสมัครสมาชิก (อนุญาตเฉพาะ field ที่ไม่อ่อนไหว)
CREATE OR REPLACE FUNCTION public.org_by_slug(p_slug text)
RETURNS TABLE(id uuid, name text, type text, approved boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, type::text, approved
  FROM public.organizations
  WHERE slug = p_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.org_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_org_slug(text) TO authenticated, service_role;
