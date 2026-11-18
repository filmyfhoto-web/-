
-- Restrict realtime.messages subscriptions:
-- - Anonymous (anon) users get no realtime access.
-- - Authenticated users can subscribe/broadcast except on staff-only topics.
-- - Staff (owner/admin) can access any topic.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_authenticated_read"   ON realtime.messages;
DROP POLICY IF EXISTS "realtime_authenticated_write"  ON realtime.messages;

CREATE POLICY "realtime_authenticated_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR (
    (realtime.topic()) NOT LIKE 'staff-%'
    AND (realtime.topic()) NOT LIKE 'admin-%'
  )
);

CREATE POLICY "realtime_authenticated_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff(auth.uid())
  OR (
    (realtime.topic()) NOT LIKE 'staff-%'
    AND (realtime.topic()) NOT LIKE 'admin-%'
  )
);
