CREATE OR REPLACE FUNCTION public.trg_rds_documents_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.status,'') = COALESCE(OLD.status,'') THEN
    RETURN NEW;
  END IF;

  v_title := 'สถานะเอกสาร ' || COALESCE(NEW.document_no, '') || ' เปลี่ยนเป็น ' || COALESCE(NEW.status, '');

  -- staff broadcast notification removed on purpose (print-shop noise)

  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id)
    SELECT
      false,
      p.id,
      'doc_status_change',
      v_title,
      jsonb_build_object(
        'document_id', NEW.id,
        'document_no', NEW.document_no,
        'document_type', NEW.document_type,
        'old_status', COALESCE(OLD.status, NULL),
        'new_status', NEW.status,
        'changed_at', now()
      )::text,
      NEW.id
    FROM public.rds_customers c
    JOIN public.profiles p ON p.organization_id = c.org_id
    WHERE c.id = NEW.customer_id
      AND c.org_id IS NOT NULL;
  END IF;

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications(for_staff, user_id, type, title, body, ref_id)
    VALUES (
      false,
      NEW.assigned_to,
      'doc_status_change',
      v_title,
      jsonb_build_object(
        'document_id', NEW.id,
        'document_no', NEW.document_no,
        'new_status', NEW.status,
        'assigned', true
      )::text,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DELETE FROM public.notifications WHERE for_staff IS TRUE AND type = 'doc_status_change';