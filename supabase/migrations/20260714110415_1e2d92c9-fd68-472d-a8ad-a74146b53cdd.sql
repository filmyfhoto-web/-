
-- Mass-revoke every outstanding customer-view token so old share links stop
-- resolving even if any backend surface is still callable.
UPDATE public.orders
SET customer_view_token_revoked_at = now()
WHERE customer_view_token IS NOT NULL
  AND customer_view_token_revoked_at IS NULL;

UPDATE public.guest_orders
SET customer_view_token_revoked_at = now()
WHERE customer_view_token IS NOT NULL
  AND customer_view_token_revoked_at IS NULL;

-- Remove anon + authenticated access to the token RPCs. Only service_role
-- (edge functions / admin) keeps EXECUTE, matching the frontend which no
-- longer exposes the feature.
REVOKE EXECUTE ON FUNCTION public.get_order_by_customer_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.regenerate_order_customer_token(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_order_customer_token(uuid, text) FROM PUBLIC, anon, authenticated;
