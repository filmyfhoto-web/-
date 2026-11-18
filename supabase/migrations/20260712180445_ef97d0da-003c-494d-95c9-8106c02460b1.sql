
-- 1) Re-scope email pipeline policies from public -> service_role explicitly.
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role manages send log"
  ON public.email_send_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role manages send state"
  ON public.email_send_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role manages unsubscribe tokens"
  ON public.email_unsubscribe_tokens FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role manages suppressed emails"
  ON public.suppressed_emails FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2) Make it explicit that guest_orders is never client-writable. Guest
-- checkout must go through the `guest-order-submit` edge function which
-- uses the service role. Adding an explicit deny-INSERT policy for
-- anon+authenticated documents intent and prevents accidental future
-- misconfiguration from silently opening writes.
DROP POLICY IF EXISTS "no client inserts on guest_orders" ON public.guest_orders;
CREATE POLICY "no client inserts on guest_orders"
  ON public.guest_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- 3) Restrict organization self-signup. Previously any authenticated user
-- could set arbitrary type/slug/contact fields as long as approved=false
-- and price_group_id IS NULL. Force self-created orgs to be plain
-- 'general' — staff must promote to school/office (which is what unlocks
-- negotiated pricing anyway).
DROP POLICY IF EXISTS "anyone insert org (signup)" ON public.organizations;
DROP POLICY IF EXISTS "users insert org pending approval" ON public.organizations;
CREATE POLICY "users self-signup general org pending approval"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (
    approved = false
    AND price_group_id IS NULL
    AND type = 'general'::customer_type
  );
