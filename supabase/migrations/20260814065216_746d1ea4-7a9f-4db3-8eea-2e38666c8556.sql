-- The RETURNS TABLE output columns (id, integration_id, ...) are in scope inside
-- the function body, so an unqualified `id` collided with them
-- ("column reference \"id\" is ambiguous"). Qualify every reference.
CREATE OR REPLACE FUNCTION public.myshop_stock_claim(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  integration_id uuid,
  channel_id text,
  mapping_id uuid,
  myshop_product_id text,
  myshop_variant_id text,
  product_id uuid,
  variant_id uuid,
  target_stock numeric,
  attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT o.id AS outbox_id
    FROM public.stock_sync_outbox o
    JOIN public.myshop_integrations i ON i.id = o.integration_id
    WHERE o.status IN ('pending','failed')
      AND o.next_retry_at <= now()
      AND i.enabled = true
      AND i.sync_inventory = true
    ORDER BY o.next_retry_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (
    UPDATE public.stock_sync_outbox o
       SET status = 'processing', attempts = o.attempts + 1, updated_at = now()
     WHERE o.id IN (SELECT d.outbox_id FROM due d)
    RETURNING o.id AS outbox_id, o.integration_id AS integration_id, o.mapping_id AS mapping_id,
              o.product_id AS product_id, o.variant_id AS variant_id,
              o.target_stock AS target_stock, o.attempts AS attempts
  )
  SELECT c.outbox_id, c.integration_id, i.channel_id, c.mapping_id,
         mp.myshop_product_id, mp.myshop_variant_id,
         c.product_id, c.variant_id, c.target_stock, c.attempts
  FROM claimed c
  JOIN public.myshop_integrations i ON i.id = c.integration_id
  LEFT JOIN public.myshop_product_mappings mp ON mp.id = c.mapping_id;
END $function$;

REVOKE ALL ON FUNCTION public.myshop_stock_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.myshop_stock_claim(integer) TO service_role;