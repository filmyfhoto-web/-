CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_uid uuid, _topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND _topic IS NOT NULL
    AND (
      -- Own personal topic
      _topic = 'user:' || _uid::text
      OR _topic LIKE ('user:' || _uid::text || ':%')
      -- Shared staff/team topics (no per-user or per-store payload)
      OR (public.is_staff_any(_uid) AND (
            _topic LIKE 'presence:%'
         OR _topic LIKE 'staff:%'
         OR _topic LIKE 'team:%'
      ))
      -- Store-scoped topics: only stores the staff member is assigned to
      -- (owners/admins are allowed on any store).
      OR (public.is_staff_any(_uid) AND _topic LIKE 'store:%' AND (
            public.is_staff(_uid)
         OR EXISTS (
              SELECT 1 FROM public.staff_stores ss
              WHERE ss.user_id = _uid
                AND split_part(_topic, ':', 2) = ss.store_id::text
            )
      ))
    )
$$;

REVOKE ALL ON FUNCTION public.realtime_topic_allowed(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.realtime_topic_allowed(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS realtime_authenticated_read ON realtime.messages;
DROP POLICY IF EXISTS realtime_authenticated_write ON realtime.messages;

CREATE POLICY realtime_authenticated_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (public.realtime_topic_allowed(auth.uid(), realtime.topic()));

CREATE POLICY realtime_authenticated_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.realtime_topic_allowed(auth.uid(), realtime.topic()));