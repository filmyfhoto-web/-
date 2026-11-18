
-- 1) Plain-text validation for customer messages
CREATE OR REPLACE FUNCTION public.is_plain_safe_text(_t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _t IS NOT NULL
    AND _t !~* '<\s*/?\s*[a-z!?]'          -- no HTML/XML-ish tags
    AND _t !~* '(javascript|data|vbscript)\s*:'  -- no dangerous URL schemes
    AND _t !~ '[\u0000-\u0008\u000b\u000c\u000e-\u001f]' -- no control chars
$$;

DROP POLICY IF EXISTS "customers insert own messages" ON public.customer_messages;
CREATE POLICY "customers insert own messages"
ON public.customer_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND length(btrim(message)) BETWEEN 1 AND 1000
  AND public.is_plain_safe_text(message)
);

-- 2) Strict store-folder validation for storage objects
CREATE OR REPLACE FUNCTION public.storage_store_folder(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/].*$'
      THEN split_part(_name, '/', 1)::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.staff_owns_storage_store(_uid uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.storage_store_folder(_name) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.staff_stores ss
      WHERE ss.user_id = _uid
        AND ss.store_id = public.storage_store_folder(_name)
    )
$$;

DROP POLICY IF EXISTS "nw-receipts staff read" ON storage.objects;
DROP POLICY IF EXISTS "nw-receipts staff write" ON storage.objects;
DROP POLICY IF EXISTS "nw-receipts staff update" ON storage.objects;
DROP POLICY IF EXISTS "nw-receipts staff delete" ON storage.objects;
DROP POLICY IF EXISTS "nw-attach staff read" ON storage.objects;
DROP POLICY IF EXISTS "nw-attach staff write" ON storage.objects;
DROP POLICY IF EXISTS "nw-attach staff update" ON storage.objects;

CREATE POLICY "nw-receipts staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nw-receipts' AND public.staff_owns_storage_store(auth.uid(), name));
CREATE POLICY "nw-receipts staff write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nw-receipts' AND public.staff_owns_storage_store(auth.uid(), name));
CREATE POLICY "nw-receipts staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nw-receipts' AND public.staff_owns_storage_store(auth.uid(), name))
WITH CHECK (bucket_id = 'nw-receipts' AND public.staff_owns_storage_store(auth.uid(), name));
CREATE POLICY "nw-receipts staff delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'nw-receipts' AND public.staff_owns_storage_store(auth.uid(), name));

CREATE POLICY "nw-attach staff read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'nw-attachments' AND public.staff_owns_storage_store(auth.uid(), name));
CREATE POLICY "nw-attach staff write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nw-attachments' AND public.staff_owns_storage_store(auth.uid(), name));
CREATE POLICY "nw-attach staff update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'nw-attachments' AND public.staff_owns_storage_store(auth.uid(), name))
WITH CHECK (bucket_id = 'nw-attachments' AND public.staff_owns_storage_store(auth.uid(), name));

-- 3) Strict realtime topic format validation
CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_uid uuid, _topic text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _uid IS NOT NULL
    AND _topic IS NOT NULL
    AND (
      _topic = 'user:' || _uid::text
      OR _topic LIKE ('user:' || _uid::text || ':%')
      OR (public.is_staff_any(_uid) AND (
            _topic ~ '^presence:[A-Za-z0-9_.:-]{1,64}$'
         OR _topic ~ '^staff:[A-Za-z0-9_.:-]{1,64}$'
         OR _topic ~ '^team:[A-Za-z0-9_.:-]{1,64}$'
      ))
      OR (
        public.is_staff_any(_uid)
        AND _topic ~ '^store:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(:[A-Za-z0-9_.-]{1,64})?$'
        AND (
          public.is_staff(_uid)
          OR EXISTS (
            SELECT 1 FROM public.staff_stores ss
            WHERE ss.user_id = _uid
              AND ss.store_id = (split_part(_topic, ':', 2))::uuid
          )
        )
      )
    )
$function$;
