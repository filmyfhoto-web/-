-- 1) ปิด + ลบปลายทางแชทส่วนตัว (U...) ออกจากห้องแจ้งเตือน
DELETE FROM public.line_notification_channels
WHERE line_destination_id LIKE 'U%';

-- 2) กันไม่ให้ผูก/เปิดใช้งานแชทส่วนตัวอีก (อนุญาตเฉพาะ group C... / room R...)
CREATE OR REPLACE FUNCTION public.line_channels_group_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.line_destination_id !~ '^[CR]' then
    raise exception 'line_notification_channels: allowed only group/room destinations (C.../R...), got %', left(coalesce(new.line_destination_id,''),1);
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_line_channels_group_only ON public.line_notification_channels;
CREATE TRIGGER trg_line_channels_group_only
BEFORE INSERT OR UPDATE ON public.line_notification_channels
FOR EACH ROW EXECUTE FUNCTION public.line_channels_group_only();