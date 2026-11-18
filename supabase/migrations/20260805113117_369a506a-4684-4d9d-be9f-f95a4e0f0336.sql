-- Remove the superseded overloads so a caller can never bind to the older
-- signature that lacks lease / permanent-failure / dedup handling.
DROP FUNCTION IF EXISTS public.notification_outbox_claim(integer);
DROP FUNCTION IF EXISTS public.notification_outbox_complete(uuid, boolean, text, text, boolean);
DROP FUNCTION IF EXISTS public.notification_outbox_enqueue(text, text, uuid, text, jsonb, text, text, uuid, uuid);