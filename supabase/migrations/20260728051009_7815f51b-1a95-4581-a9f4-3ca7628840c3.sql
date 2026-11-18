DROP POLICY IF EXISTS "realtime_authenticated_read" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_authenticated_write" ON realtime.messages;

CREATE POLICY "realtime_authenticated_read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
);

CREATE POLICY "realtime_authenticated_write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff(auth.uid())
  OR realtime.topic() = 'user:' || auth.uid()::text
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || ':%'
);